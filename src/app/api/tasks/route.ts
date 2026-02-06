import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { parseTaskInput, estimateTaskDuration, assessPriority } from "@/lib/gemini";
import { findOptimalSlot, calculatePriority } from "@/lib/scheduling";
import { createEvent } from "@/lib/google-calendar";
import { setCredentials } from "@/lib/google-auth";
import type { CreateTaskRequest, CreateTaskResponse, Task } from "@/lib/types";

// GET /api/tasks - List tasks
export async function GET(request: NextRequest) {
    const supabase = await createClient();
    const cookieStore = await cookies();
    const email = cookieStore.get("tb_email")?.value;

    if (!email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user
    const { data: user } = await supabase
        .from("users")
        .select("id")
        .eq("email", email)
        .single();

    if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Parse query params
    const searchParams = request.nextUrl.searchParams;
    const date = searchParams.get("date"); // YYYY-MM-DD format
    const status = searchParams.get("status");

    // Build query
    let query = supabase
        .from("tasks")
        .select("*")
        .eq("user_id", user.id)
        .order("scheduled_start", { ascending: true, nullsFirst: false });

    if (date) {
        const startOfDay = `${date}T00:00:00`;
        const endOfDay = `${date}T23:59:59`;
        query = query.gte("scheduled_start", startOfDay).lte("scheduled_start", endOfDay);
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
    const supabase = await createClient();
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
        const { input, deadline, context } = body;

        if (!input || typeof input !== "string") {
            return NextResponse.json({ error: "Task input is required" }, { status: 400 });
        }

        // 1. Parse task with AI
        const parsed = await parseTaskInput(input);

        // 2. Get user memory
        const { data: userMemory } = await supabase
            .from("user_memory")
            .select("*")
            .eq("user_id", user.id);

        // 3. Get existing tasks for today
        const today = new Date().toISOString().split("T")[0];
        const { data: existingTasks } = await supabase
            .from("tasks")
            .select("*")
            .eq("user_id", user.id)
            .eq("status", "scheduled")
            .gte("scheduled_start", `${today}T00:00:00`)
            .lte("scheduled_start", `${today}T23:59:59`);

        // 4. Estimate duration
        const { estimatedMinutes } = await estimateTaskDuration(
            parsed.title,
            parsed.suggestedCategory,
            []
        );

        // 5. Calculate priority
        const taskDeadline = deadline || parsed.deadline;
        let priority: number;

        if (taskDeadline) {
            const { priority: aiPriority } = await assessPriority(
                parsed.title,
                parsed.description,
                parsed.suggestedCategory,
                taskDeadline,
                (existingTasks || []).map((t) => ({
                    title: t.title,
                    priority: t.priority,
                    deadline: t.deadline,
                }))
            );
            priority = aiPriority;
        } else {
            priority = calculatePriority({
                deadline: taskDeadline,
                taskType: parsed.suggestedCategory,
                existingTasks: existingTasks || [],
            });
        }

        // 6. Find optimal time slot
        let scheduledStart: Date | null = null;
        let scheduledEnd: Date | null = null;
        let googleEventId: string | null = null;

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
                existingTasks: existingTasks || [],
            });

            if (slot) {
                scheduledStart = slot.start;
                scheduledEnd = slot.end;

                // 7. Create Google Calendar event
                try {
                    googleEventId = await createEvent(auth, {
                        summary: parsed.title,
                        description: context || parsed.description || undefined,
                        start: scheduledStart,
                        end: scheduledEnd,
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
                description: context || parsed.description,
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

        // 9. Create notification
        const { data: notification } = await supabase
            .from("notifications")
            .insert({
                user_id: user.id,
                type: "task_blocked",
                title: "Task Scheduled",
                message: scheduledStart
                    ? `"${parsed.title}" scheduled for ${scheduledStart.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
                    : `"${parsed.title}" added but no time slot available today`,
                related_task_id: task.id,
            })
            .select()
            .single();

        const response: CreateTaskResponse = {
            task: task as Task,
            notification: {
                message: notification?.message || "Task created",
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
