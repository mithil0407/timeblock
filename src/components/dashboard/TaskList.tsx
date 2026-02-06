"use client";

import { TaskCard } from "./TaskCard";
import { CheckCircle2, ListTodo } from "lucide-react";
import type { Task } from "@/lib/types";

interface TaskListProps {
    tasks: Task[];
    onComplete: (id: string) => void;
    onDelete: (id: string) => void;
    onPriorityChange: (id: string, priority: number) => void;
}

export function TaskList({
    tasks,
    onComplete,
    onDelete,
    onPriorityChange,
}: TaskListProps) {
    const scheduledTasks = tasks.filter((t) => t.status === "scheduled" || t.status === "in_progress");
    const completedTasks = tasks.filter((t) => t.status === "completed");

    if (tasks.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                    <ListTodo className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="font-medium text-lg mb-1">No tasks for today</h3>
                <p className="text-sm text-muted-foreground max-w-[240px]">
                    Add a task above to get started with time blocking your day
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Scheduled Tasks */}
            {scheduledTasks.length > 0 && (
                <div className="space-y-2">
                    <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <ListTodo className="w-4 h-4" />
                        Today&apos;s Tasks ({scheduledTasks.length})
                    </h2>
                    <div className="space-y-2">
                        {scheduledTasks.map((task) => (
                            <TaskCard
                                key={task.id}
                                task={task}
                                onComplete={onComplete}
                                onDelete={onDelete}
                                onPriorityChange={onPriorityChange}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Completed Tasks */}
            {completedTasks.length > 0 && (
                <div className="space-y-2">
                    <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4" />
                        Completed ({completedTasks.length})
                    </h2>
                    <div className="space-y-2">
                        {completedTasks.map((task) => (
                            <TaskCard
                                key={task.id}
                                task={task}
                                onComplete={onComplete}
                                onDelete={onDelete}
                                onPriorityChange={onPriorityChange}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
