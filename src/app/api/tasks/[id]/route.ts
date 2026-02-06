import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { updateEvent, deleteEvent } from "@/lib/google-calendar";
import { setCredentials } from "@/lib/google-auth";
import type { UpdateTaskRequest } from "@/lib/types";

// GET /api/tasks/[id] - Get single task
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const supabase = await createClient();
    const cookieStore = await cookies();
    const email = cookieStore.get("tb_email")?.value;

    if (!email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: user } = await supabase
        .from("users")
        .select("id")
        .eq("email", email)
        .single();

    if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

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
    const supabase = await createClient();
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

        // Log schedule change
        if (status === "completed" || priority !== undefined || deadline !== undefined) {
            await supabase.from("schedule_changes").insert({
                user_id: user.id,
                trigger_type:
                    status === "completed"
                        ? "task_completed_early"
                        : priority !== undefined
                            ? "priority_changed"
                            : "deadline_changed",
                trigger_task_id: id,
                changes_made: [
                    {
                        taskId: id,
                        previousStart: existingTask.scheduled_start,
                        previousEnd: existingTask.scheduled_end,
                        newStart: scheduled_start || existingTask.scheduled_start,
                        newEnd: scheduled_end || existingTask.scheduled_end,
                        action: "updated",
                    },
                ],
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
    const supabase = await createClient();
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
