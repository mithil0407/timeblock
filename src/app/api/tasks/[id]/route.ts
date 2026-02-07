import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getOrCreateUserByEmail } from "@/lib/supabase/user";
import { cookies } from "next/headers";
import { updateEvent, deleteEvent } from "@/lib/google-calendar";
import { setCredentials } from "@/lib/google-auth";
import { findOptimalSlot, getEndOfDay, getStartOfDay } from "@/lib/scheduling";
import type { UpdateTaskRequest, Task, UserMemory } from "@/lib/types";

type SupabaseClient = ReturnType<typeof createAdminClient>;

// GET /api/tasks/[id] - Get single task
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const supabase = createAdminClient();
    const cookieStore = await cookies();
    const email = cookieStore.get("tb_email")?.value;

    if (!email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await getOrCreateUserByEmail(email);

    const { data: task, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .single();

    if (error || !task) {
        return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json({ task });
}

// PATCH /api/tasks/[id] - Update task
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const supabase = createAdminClient();
    const cookieStore = await cookies();
    const email = cookieStore.get("tb_email")?.value;

    if (!email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: user } = await supabase
        .from("users")
        .select("*")
        .eq("email", email)
        .single();

    if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    try {
        const body: UpdateTaskRequest = await request.json();
        const { status, priority, deadline, scheduled_start, scheduled_end } = body;

        // Get existing task
        const { data: existingTask } = await supabase
            .from("tasks")
            .select("*")
            .eq("id", id)
            .eq("user_id", user.id)
            .single();

        if (!existingTask) {
            return NextResponse.json({ error: "Task not found" }, { status: 404 });
        }

        // Build update object
        const updates: Record<string, unknown> = {};

        if (status) {
            updates.status = status;
            if (status === "completed") {
                updates.completed_at = new Date().toISOString();
                // Calculate actual duration
                if (existingTask.scheduled_start) {
                    const started = new Date(existingTask.scheduled_start);
                    const now = new Date();
                    updates.actual_duration_minutes = Math.round(
                        (now.getTime() - started.getTime()) / (1000 * 60)
                    );
                }
            }
        }

        if (priority !== undefined) updates.priority = priority;
        if (deadline !== undefined) updates.deadline = deadline;
        if (scheduled_start !== undefined) updates.scheduled_start = scheduled_start;
        if (scheduled_end !== undefined) updates.scheduled_end = scheduled_end;

        // Update task
        const { data: updatedTask, error: updateError } = await supabase
            .from("tasks")
            .update(updates)
            .eq("id", id)
            .select()
            .single();

        if (updateError) {
            console.error("Error updating task:", updateError);
            return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
        }

        // Update Google Calendar event if schedule changed
        if (
            (scheduled_start || scheduled_end) &&
            existingTask.google_calendar_event_id &&
            user.google_access_token
        ) {
            try {
                const auth = setCredentials({
                    access_token: user.google_access_token,
                    refresh_token: user.google_refresh_token,
                });

                await updateEvent(auth, existingTask.google_calendar_event_id, {
                    start: scheduled_start ? new Date(scheduled_start) : undefined,
                    end: scheduled_end ? new Date(scheduled_end) : undefined,
                });
            } catch (calError) {
                console.error("Failed to update calendar event:", calError);
            }
        }

        // Delete calendar event if task completed
        if (
            status === "completed" &&
            existingTask.google_calendar_event_id &&
            user.google_access_token
        ) {
            try {
                const auth = setCredentials({
                    access_token: user.google_access_token,
                    refresh_token: user.google_refresh_token,
                });

                await deleteEvent(auth, existingTask.google_calendar_event_id);
            } catch (calError) {
                console.error("Failed to delete calendar event:", calError);
            }
        }

        // Update memory and reschedule when needed
        if (status === "completed") {
            const actualMinutes = updatedTask.actual_duration_minutes as number | null;
            await updateTaskDurationMemory(
                supabase,
                user.id,
                existingTask.task_category,
                actualMinutes
            );
            await updateTaskEnergyMemory(
                supabase,
                user.id,
                existingTask.task_category,
                existingTask.energy_requirement
            );

            const estimated = existingTask.estimated_duration_minutes;
            const timeSaved = actualMinutes ? Math.max(0, estimated - actualMinutes) : 0;
            if (timeSaved >= 5 && user.google_access_token) {
                const auth = setCredentials({
                    access_token: user.google_access_token,
                    refresh_token: user.google_refresh_token,
                });

                await rescheduleRemainingTasks({
                    supabase,
                    user,
                    auth,
                    triggerType: "task_completed_early",
                    excludeTaskId: id,
                });
            }
        }

        if ((priority !== undefined || deadline !== undefined) && user.google_access_token) {
            const auth = setCredentials({
                access_token: user.google_access_token,
                refresh_token: user.google_refresh_token,
            });

            await rescheduleRemainingTasks({
                supabase,
                user,
                auth,
                triggerType: priority !== undefined ? "priority_changed" : "deadline_changed",
            });
        }

        return NextResponse.json({ task: updatedTask });
    } catch (err) {
        console.error("Error updating task:", err);
        return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
    }
}

// DELETE /api/tasks/[id] - Delete task
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const supabase = createAdminClient();
    const cookieStore = await cookies();
    const email = cookieStore.get("tb_email")?.value;

    if (!email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: user } = await supabase
        .from("users")
        .select("*")
        .eq("email", email)
        .single();

    if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get task before deletion
    const { data: task } = await supabase
        .from("tasks")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .single();

    if (!task) {
        return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Delete from Google Calendar
    if (task.google_calendar_event_id && user.google_access_token) {
        try {
            const auth = setCredentials({
                access_token: user.google_access_token,
                refresh_token: user.google_refresh_token,
            });

            await deleteEvent(auth, task.google_calendar_event_id);
        } catch (calError) {
            console.error("Failed to delete calendar event:", calError);
        }
    }

    // Delete task
    const { error: deleteError } = await supabase
        .from("tasks")
        .delete()
        .eq("id", id);

    if (deleteError) {
        console.error("Error deleting task:", deleteError);
        return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
    }

    // Log schedule change
    await supabase.from("schedule_changes").insert({
        user_id: user.id,
        trigger_type: "task_deleted",
        trigger_task_id: null,
        changes_made: [
            {
                taskId: id,
                previousStart: task.scheduled_start,
                previousEnd: task.scheduled_end,
                action: "deleted",
            },
        ],
    });

    return NextResponse.json({ success: true });
}

async function updateTaskDurationMemory(
    supabase: SupabaseClient,
    userId: string,
    taskCategory: string | null,
    actualDurationMinutes: number | null
) {
    if (!taskCategory || !actualDurationMinutes) return;

    const { data: existing } = await supabase
        .from("user_memory")
        .select("value")
        .eq("user_id", userId)
        .eq("memory_type", "task_duration")
        .eq("key", taskCategory)
        .single();

    const existingValue = existing?.value as
        | { average_minutes?: number; sample_count?: number }
        | undefined;

    const prevAvg = existingValue?.average_minutes ?? actualDurationMinutes;
    const prevCount = existingValue?.sample_count ?? 0;
    const nextCount = prevCount + 1;
    const nextAvg = Math.round((prevAvg * prevCount + actualDurationMinutes) / nextCount);

    await supabase.from("user_memory").upsert(
        {
            user_id: userId,
            memory_type: "task_duration",
            key: taskCategory,
            value: {
                average_minutes: nextAvg,
                sample_count: nextCount,
                last_updated: new Date().toISOString(),
            },
        },
        { onConflict: "user_id,memory_type,key" }
    );
}

async function updateTaskEnergyMemory(
    supabase: SupabaseClient,
    userId: string,
    taskCategory: string | null,
    energyRequirement: string | null
) {
    if (!taskCategory || !energyRequirement) return;

    await supabase.from("user_memory").upsert(
        {
            user_id: userId,
            memory_type: "task_energy",
            key: taskCategory,
            value: {
                energy_requirement: energyRequirement,
                task_category: taskCategory,
            },
        },
        { onConflict: "user_id,memory_type,key" }
    );
}

async function rescheduleRemainingTasks({
    supabase,
    user,
    auth,
    triggerType,
    excludeTaskId,
}: {
    supabase: SupabaseClient;
    user: { id: string; google_access_token: string | null; google_refresh_token: string | null };
    auth: ReturnType<typeof setCredentials>;
    triggerType: "task_completed_early" | "priority_changed" | "deadline_changed";
    excludeTaskId?: string;
}) {
    const { data: userMemory } = await supabase
        .from("user_memory")
        .select("*")
        .eq("user_id", user.id);

    const { data: tasks } = await supabase
        .from("tasks")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "scheduled");

    const startOfDay = getStartOfDay();
    const endOfDay = getEndOfDay();
    const now = new Date();

    const tasksToReschedule = (tasks || [])
        .filter((task: Task) => task.id !== excludeTaskId)
        .filter((task: Task) => {
            if (!task.scheduled_start) return true;
            const scheduled = new Date(task.scheduled_start);
            return scheduled >= now && scheduled >= startOfDay && scheduled <= endOfDay;
        })
        .sort((a: Task, b: Task) => {
            if (a.priority !== b.priority) return b.priority - a.priority;
            const aDeadline = a.deadline ? new Date(a.deadline).getTime() : Number.MAX_SAFE_INTEGER;
            const bDeadline = b.deadline ? new Date(b.deadline).getTime() : Number.MAX_SAFE_INTEGER;
            if (aDeadline !== bDeadline) return aDeadline - bDeadline;
            const aStart = a.scheduled_start ? new Date(a.scheduled_start).getTime() : Number.MAX_SAFE_INTEGER;
            const bStart = b.scheduled_start ? new Date(b.scheduled_start).getTime() : Number.MAX_SAFE_INTEGER;
            return aStart - bStart;
        });

    if (tasksToReschedule.length === 0) return;

    const ignoreEventIds = tasksToReschedule
        .map((t: Task) => t.google_calendar_event_id)
        .filter((id): id is string => Boolean(id));

    const busySlots: Array<{ start: Date; end: Date }> = [];
    const plannedTasks: Task[] = [];
    const changes: Array<{
        taskId: string;
        previousStart?: string;
        previousEnd?: string;
        newStart?: string;
        newEnd?: string;
        action: "updated";
    }> = [];

    for (const task of tasksToReschedule) {
        const slot = await findOptimalSlot({
            auth,
            duration: task.estimated_duration_minutes,
            priority: task.priority,
            energyRequirement: (task.energy_requirement || "medium") as "high" | "medium" | "low",
            userMemory: (userMemory || []) as UserMemory[],
            existingTasks: plannedTasks,
            ignoreEventIds,
            busySlots,
        });

        const fallbackSlot =
            task.scheduled_start && task.scheduled_end
                ? {
                    start: new Date(task.scheduled_start),
                    end: new Date(task.scheduled_end),
                }
                : null;

        const chosen = slot || fallbackSlot;
        if (chosen) {
            busySlots.push({ start: chosen.start, end: chosen.end });
        }

        if (!slot) {
            if (fallbackSlot) {
                plannedTasks.push({
                    ...task,
                    scheduled_start: fallbackSlot.start.toISOString(),
                    scheduled_end: fallbackSlot.end.toISOString(),
                });
            }
            continue;
        }

        const previousStart = task.scheduled_start;
        const previousEnd = task.scheduled_end;
        const newStart = slot.start.toISOString();
        const newEnd = slot.end.toISOString();

        if (previousStart !== newStart || previousEnd !== newEnd) {
            if (task.google_calendar_event_id) {
                try {
                    await updateEvent(auth, task.google_calendar_event_id, {
                        start: slot.start,
                        end: slot.end,
                    });
                } catch (calError) {
                    console.error("Failed to update calendar event:", calError);
                }
            }

            await supabase
                .from("tasks")
                .update({
                    scheduled_start: newStart,
                    scheduled_end: newEnd,
                })
                .eq("id", task.id);

            changes.push({
                taskId: task.id,
                previousStart,
                previousEnd,
                newStart,
                newEnd,
                action: "updated",
            });
        }

        plannedTasks.push({
            ...task,
            scheduled_start: newStart,
            scheduled_end: newEnd,
        });
    }

    if (changes.length > 0) {
        await supabase.from("schedule_changes").insert({
            user_id: user.id,
            trigger_type: triggerType,
            trigger_task_id: excludeTaskId || null,
            changes_made: changes,
            ai_reasoning: "Heuristic reschedule based on availability and priorities",
        });

        await supabase.from("notifications").insert({
            user_id: user.id,
            type: "schedule_updated",
            title: "Schedule Updated",
            message: "Your schedule has been updated based on your latest changes.",
        });
    }
}
