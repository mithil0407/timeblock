import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getOrCreateUserByEmail } from "@/lib/supabase/user";
import { cookies } from "next/headers";
import { parseTaskInput, estimateTaskDuration, assessPriority, generateTaskDescription } from "@/lib/gemini";
import { findOptimalSlot, calculatePriority } from "@/lib/scheduling";
import { createEvent } from "@/lib/google-calendar";
import { setCredentials } from "@/lib/google-auth";
import type { CreateTaskRequest, CreateTaskResponse, Task } from "@/lib/types";
import { getEndOfDayInTimeZone, getStartOfDayInTimeZone, zonedTimeToUtc } from "@/lib/timezone";
import { loadBusinessContext } from "@/lib/business-context";

// GET /api/tasks - List tasks
export async function GET(request: NextRequest) {
    const supabase = createAdminClient();
    const cookieStore = await cookies();
    const email = cookieStore.get("tb_email")?.value;

    if (!email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get or create user
    const user = await getOrCreateUserByEmail(email);

    // Parse query params
    const searchParams = request.nextUrl.searchParams;
    const date = searchParams.get("date"); // YYYY-MM-DD format
    const status = searchParams.get("status");
    const tz = searchParams.get("tz");

    // Build query
    let query = supabase
        .from("tasks")
        .select("*")
        .eq("user_id", user.id)
        .order("scheduled_start", { ascending: true, nullsFirst: false });

    if (date) {
        if (tz) {
            const [year, month, day] = date.split("-").map((v) => parseInt(v, 10));
            if (!Number.isNaN(year) && !Number.isNaN(month) && !Number.isNaN(day)) {
                const startOfDay = zonedTimeToUtc(
                    { year, month, day, hour: 0, minute: 0, second: 0 },
                    tz
                );
                const endOfDay = zonedTimeToUtc(
                    { year, month, day, hour: 23, minute: 59, second: 59 },
                    tz
                );
                query = query
                    .gte("scheduled_start", startOfDay.toISOString())
                    .lte("scheduled_start", endOfDay.toISOString());
            }
        } else {
            const startOfDay = `${date}T00:00:00`;
            const endOfDay = `${date}T23:59:59`;
            query = query.gte("scheduled_start", startOfDay).lte("scheduled_start", endOfDay);
        }
    }

    if (status) {
        query = query.eq("status", status);
    }

    const { data: tasks, error } = await query;

    if (error) {
        console.error("Error fetching tasks:", error);
        return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
    }

    return NextResponse.json({ tasks });
}

// POST /api/tasks - Create new task
export async function POST(request: NextRequest) {
    const supabase = createAdminClient();
    const cookieStore = await cookies();
    const email = cookieStore.get("tb_email")?.value;

    if (!email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user with Google tokens
    const { data: user } = await supabase
        .from("users")
        .select("*")
        .eq("email", email)
        .single();

    if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    try {
        const body: CreateTaskRequest = await request.json();
        const { input, deadline, context, timeZone } = body;

        if (!input || typeof input !== "string") {
            return NextResponse.json({ error: "Task input is required" }, { status: 400 });
        }

        const inputs = splitTaskInput(input);

        // 1. Get user memory
        const { data: userMemory } = await supabase
            .from("user_memory")
            .select("*")
            .eq("user_id", user.id);

        const resolvedTimeZone =
            timeZone ||
            getTimezoneFromMemory(userMemory || []) ||
            "UTC";

        if (timeZone && timeZone !== getTimezoneFromMemory(userMemory || [])) {
            await supabase.from("user_memory").upsert(
                {
                    user_id: user.id,
                    memory_type: "preferences",
                    key: "timezone",
                    value: timeZone,
                },
                { onConflict: "user_id,memory_type,key" }
            );
        }

        // 2. Get existing tasks for scheduling window
        const windowStart = getStartOfDayInTimeZone(new Date(), resolvedTimeZone);
        const windowEnd = getEndOfDayInTimeZone(
            new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            resolvedTimeZone
        );
        const { data: existingTasks } = await supabase
            .from("tasks")
            .select("*")
            .eq("user_id", user.id)
            .eq("status", "scheduled")
            .gte("scheduled_start", windowStart.toISOString())
            .lte("scheduled_start", windowEnd.toISOString());

        const plannedTasks: Task[] = [];
        const createdTasks: Task[] = [];
        const changeLog: Array<{
            taskId: string;
            newStart?: string;
            newEnd?: string;
            action: "created";
        }> = [];

        let businessContext: string | null = null;
        try {
            businessContext = await loadBusinessContext();
        } catch (error) {
            console.warn("Failed to load business context:", error);
        }

        for (const rawInput of inputs) {
            // 3. Parse task with AI
            const parsed = await parseTaskInput(rawInput, [], { timeZone: resolvedTimeZone });

            // 4. Estimate duration
            const estimate =
                parsed.explicitDuration ??
                (await estimateTaskDuration(parsed.title, parsed.suggestedCategory, [])).estimatedMinutes;
            const estimatedMinutes = Math.max(15, Math.min(480, estimate));

            // 5. Calculate priority
            let taskDeadline = deadline || parsed.deadline;
            if (taskDeadline) {
                const deadlineDate = new Date(taskDeadline);
                if (deadlineDate.getTime() < Date.now() - 60 * 1000) {
                    taskDeadline = null;
                }
            }

            let priority = calculatePriority({
                deadline: taskDeadline,
                taskType: parsed.suggestedCategory,
                existingTasks: existingTasks || [],
            });

            try {
                const { priority: aiPriority } = await assessPriority(
                    parsed.title,
                    parsed.description,
                    parsed.suggestedCategory,
                    taskDeadline,
                    [...(existingTasks || []), ...plannedTasks].map((t) => ({
                        title: t.title,
                        priority: t.priority,
                        deadline: t.deadline || undefined,
                    }))
                );
                priority = aiPriority;
            } catch {
                // Keep heuristic priority
            }

            // 6. Find optimal time slot
            let scheduledStart: Date | null = null;
            let scheduledEnd: Date | null = null;
            let googleEventId: string | null = null;
            let enrichedDescription: string | null = context || parsed.description || null;

            if (user.google_access_token) {
                const auth = setCredentials({
                    access_token: user.google_access_token,
                    refresh_token: user.google_refresh_token,
                });

                const slot = await findOptimalSlot({
                    auth,
                    duration: estimatedMinutes,
                    priority,
                    energyRequirement: parsed.energyRequirement,
                    userMemory: userMemory || [],
                    existingTasks: [...(existingTasks || []), ...plannedTasks],
                    timeZone: resolvedTimeZone,
                });

                if (slot) {
                    scheduledStart = slot.start;
                    scheduledEnd = slot.end;

                    if (businessContext) {
                        try {
                            const { description } = await generateTaskDescription({
                                taskTitle: parsed.title,
                                parsedDescription: parsed.description,
                                userContext: context || null,
                                businessContext,
                            });
                            enrichedDescription = description || enrichedDescription;
                        } catch {
                            // Keep fallback description
                        }
                    }

                    // 7. Create Google Calendar event
                    try {
                        googleEventId = await createEvent(auth, {
                            summary: parsed.title,
                            description: enrichedDescription || undefined,
                            start: scheduledStart,
                            end: scheduledEnd,
                            timeZone: resolvedTimeZone,
                        });
                    } catch (calError) {
                        console.error("Failed to create calendar event:", calError);
                        // Continue without calendar event
                    }
                }
            }

            // 8. Create task in database
            const { data: task, error: createError } = await supabase
                .from("tasks")
                .insert({
                    user_id: user.id,
                    title: parsed.title,
                    description: enrichedDescription,
                    estimated_duration_minutes: estimatedMinutes,
                    priority,
                    deadline: taskDeadline,
                    scheduled_start: scheduledStart?.toISOString(),
                    scheduled_end: scheduledEnd?.toISOString(),
                    status: "scheduled",
                    google_calendar_event_id: googleEventId,
                    task_category: parsed.suggestedCategory,
                    energy_requirement: parsed.energyRequirement,
                    context,
                })
                .select()
                .single();

            if (createError) {
                console.error("Error creating task:", createError);
                return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
            }

            const scheduledMessage = scheduledStart
                ? new Intl.DateTimeFormat("en-US", {
                    timeZone: resolvedTimeZone,
                    hour: "numeric",
                    minute: "2-digit",
                }).format(scheduledStart)
                : null;

            // 9. Create notification
            const notificationType = scheduledStart ? "task_blocked" : "conflict_detected";
            await supabase.from("notifications").insert({
                user_id: user.id,
                type: notificationType,
                title: "Task Scheduled",
                message: scheduledStart
                    ? `"${parsed.title}" scheduled for ${scheduledMessage}`
                    : `"${parsed.title}" added but no time slot available today`,
                related_task_id: task.id,
            });

            // 10. Log schedule change
            changeLog.push({
                taskId: task.id,
                newStart: scheduledStart?.toISOString(),
                newEnd: scheduledEnd?.toISOString(),
                action: "created",
            });

            plannedTasks.push(task as Task);
            createdTasks.push(task as Task);
        }

        await supabase.from("schedule_changes").insert({
            user_id: user.id,
            trigger_type: "task_added",
            trigger_task_id: createdTasks[0]?.id ?? null,
            changes_made: changeLog,
            ai_reasoning:
                createdTasks.length > 1
                    ? "Batch scheduling for new tasks"
                    : "Initial scheduling for new task",
        });

        const response: CreateTaskResponse = {
            task: createdTasks.length === 1 ? (createdTasks[0] as Task) : undefined,
            tasks: createdTasks.length > 1 ? createdTasks : undefined,
            notification: {
                message:
                    createdTasks.length > 1
                        ? `${createdTasks.length} tasks created`
                        : "Task created",
            },
        };

        return NextResponse.json(response, { status: 201 });
    } catch (err) {
        console.error("Error processing task:", err);
        return NextResponse.json(
            { error: "Failed to process task" },
            { status: 500 }
        );
    }
}

function splitTaskInput(input: string): string[] {
    const trimmed = input.trim();
    if (!trimmed) return [];

    const newlineSplit = trimmed.split(/\n+/).map((part) => part.trim()).filter(Boolean);
    if (newlineSplit.length > 1) {
        return newlineSplit.flatMap((part) => part.split(/\s*;\s*/)).filter(Boolean);
    }

    const semicolonSplit = trimmed.split(/\s*;\s*/).map((part) => part.trim()).filter(Boolean);
    if (semicolonSplit.length > 1) {
        return semicolonSplit;
    }

    const commaSplit = trimmed.split(/\s*,\s*/).map((part) => part.trim()).filter(Boolean);
    if (commaSplit.length > 1) {
        const deadlineKeywords = ["due", "by", "tomorrow", "today", "tonight", "eod", "eow", "eom", "next", "at", "on"];
        const looksLikeSingleTask = commaSplit.slice(1).some((part) =>
            deadlineKeywords.some((keyword) => part.toLowerCase().startsWith(keyword))
        );
        if (!looksLikeSingleTask) {
            return commaSplit;
        }
    }

    return [trimmed];
}

function getTimezoneFromMemory(userMemory: Array<{ memory_type: string; key: string; value: unknown }>): string | null {
    const prefs = userMemory.filter((m) => m.memory_type === "preferences");
    for (const pref of prefs) {
        if (pref.key === "timezone") {
            if (typeof pref.value === "string") return pref.value;
            if (pref.value && typeof pref.value === "object") {
                const tz = (pref.value as { timezone?: string }).timezone;
                if (tz) return tz;
            }
        }
        if (pref.key === "default" && pref.value && typeof pref.value === "object") {
            const tz = (pref.value as { timezone?: string }).timezone;
            if (tz) return tz;
        }
    }
    return null;
}
