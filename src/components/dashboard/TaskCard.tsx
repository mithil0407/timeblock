"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    DropdownMenuSub,
    DropdownMenuSubTrigger,
    DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Clock, Trash2, Edit, Zap } from "lucide-react";
import { cn, formatTime, formatDuration, getPriorityLabel } from "@/lib/utils";
import type { Task } from "@/lib/types";

interface TaskCardProps {
    task: Task;
    onComplete: (id: string) => void;
    onDelete: (id: string) => void;
    onPriorityChange: (id: string, priority: number) => void;
}

export function TaskCard({
    task,
    onComplete,
    onDelete,
    onPriorityChange,
}: TaskCardProps) {
    const [isUpdating, setIsUpdating] = useState(false);

    const priorityColors: Record<number, string> = {
        1: "bg-gray-200 text-gray-700",
        2: "bg-blue-100 text-blue-700",
        3: "bg-yellow-100 text-yellow-700",
        4: "bg-orange-100 text-orange-700",
        5: "bg-red-100 text-red-700",
    };

    const energyColors: Record<string, string> = {
        high: "text-green-600",
        medium: "text-yellow-600",
        low: "text-red-400",
    };

    const handleComplete = async () => {
        setIsUpdating(true);
        await onComplete(task.id);
        setIsUpdating(false);
    };

    const handlePriorityChange = async (priority: number) => {
        setIsUpdating(true);
        await onPriorityChange(task.id, priority);
        setIsUpdating(false);
    };

    const isCompleted = task.status === "completed";

    return (
        <div
            className={cn(
                "group bg-card border rounded-lg p-4 transition-all hover:shadow-md task-card-enter",
                isCompleted && "opacity-60",
                isUpdating && "opacity-50 pointer-events-none"
            )}
        >
            <div className="flex items-start gap-3">
                {/* Checkbox */}
                <Checkbox
                    checked={isCompleted}
                    onCheckedChange={handleComplete}
                    className="mt-1"
                    disabled={isUpdating}
                />

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                            {/* Title */}
                            <h3
                                className={cn(
                                    "font-medium text-sm leading-tight",
                                    isCompleted && "line-through text-muted-foreground"
                                )}
                            >
                                {task.title}
                            </h3>

                            {/* Meta info */}
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                {/* Time */}
                                {task.scheduled_start && (
                                    <span className="flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {formatTime(task.scheduled_start)}
                                        {task.scheduled_end && ` - ${formatTime(task.scheduled_end)}`}
                                    </span>
                                )}

                                {/* Duration */}
                                <span>• {formatDuration(task.estimated_duration_minutes)}</span>

                                {/* Energy indicator */}
                                {task.energy_requirement && (
                                    <span
                                        className={cn(
                                            "flex items-center gap-0.5",
                                            energyColors[task.energy_requirement]
                                        )}
                                    >
                                        <Zap className="w-3 h-3" />
                                        {task.energy_requirement}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1">
                            {/* Priority badge */}
                            <Badge
                                className={cn(
                                    "text-[10px] px-1.5 py-0 h-5",
                                    priorityColors[task.priority]
                                )}
                            >
                                P{task.priority}
                            </Badge>

                            {/* Menu */}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <MoreHorizontal className="w-4 h-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuSub>
                                        <DropdownMenuSubTrigger>
                                            <Edit className="w-4 h-4 mr-2" />
                                            Change Priority
                                        </DropdownMenuSubTrigger>
                                        <DropdownMenuSubContent>
                                            {[1, 2, 3, 4, 5].map((p) => (
                                                <DropdownMenuItem
                                                    key={p}
                                                    onClick={() => handlePriorityChange(p)}
                                                    className={cn(
                                                        task.priority === p && "bg-accent"
                                                    )}
                                                >
                                                    <span
                                                        className={cn(
                                                            "w-2 h-2 rounded-full mr-2",
                                                            priorityColors[p].split(" ")[0]
                                                        )}
                                                    />
                                                    {getPriorityLabel(p)}
                                                </DropdownMenuItem>
                                            ))}
                                        </DropdownMenuSubContent>
                                    </DropdownMenuSub>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        onClick={() => onDelete(task.id)}
                                        className="text-destructive focus:text-destructive"
                                    >
                                        <Trash2 className="w-4 h-4 mr-2" />
                                        Delete Task
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>

                    {/* Description */}
                    {task.description && (
                        <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                            {task.description}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
