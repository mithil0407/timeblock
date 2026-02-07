"use client";

import { useMemo } from "react";
import { cn, formatTime } from "@/lib/utils";
import type { Task } from "@/lib/types";

interface CalendarViewProps {
    tasks: Task[];
    workingHours?: { start: number; end: number };
    energyLevels?: Record<string, { level: string }>;
}

export function CalendarView({
    tasks,
    workingHours = { start: 9, end: 18 },
    energyLevels = {},
}: CalendarViewProps) {
    const scheduledTasks = useMemo(
        () => tasks.filter((t) => t.scheduled_start && t.status !== "completed"),
        [tasks]
    );
    const unscheduledTasks = useMemo(
        () => tasks.filter((t) => !t.scheduled_start && t.status !== "completed"),
        [tasks]
    );

    const displayRange = useMemo(() => {
        if (scheduledTasks.length === 0) {
            return { start: workingHours.start, end: workingHours.end };
        }

        let minHour = workingHours.start;
        let maxHour = workingHours.end;

        for (const task of scheduledTasks) {
            if (!task.scheduled_start || !task.scheduled_end) continue;
            const start = new Date(task.scheduled_start);
            const end = new Date(task.scheduled_end);
            const startHour = start.getHours() + start.getMinutes() / 60;
            const endHour = end.getHours() + end.getMinutes() / 60;
            minHour = Math.min(minHour, Math.floor(startHour));
            maxHour = Math.max(maxHour, Math.ceil(endHour));
        }

        return {
            start: Math.max(0, minHour),
            end: Math.min(24, Math.max(minHour + 1, maxHour)),
        };
    }, [scheduledTasks, workingHours.end, workingHours.start]);

    // Generate time slots
    const timeSlots = useMemo(() => {
        const slots = [];
        for (let hour = displayRange.start; hour <= displayRange.end; hour++) {
            slots.push({ hour, label: formatHour(hour) });
        }
        return slots;
    }, [displayRange]);

    // Get energy level for a given hour
    const getEnergyClass = (hour: number): string => {
        for (const [range, data] of Object.entries(energyLevels)) {
            const [start, end] = range.split("-").map((t) => parseInt(t.split(":")[0], 10));
            if (hour >= start && hour < end) {
                switch (data.level) {
                    case "high":
                        return "energy-high";
                    case "medium":
                        return "energy-medium";
                    case "low":
                        return "energy-low";
                }
            }
        }
        return "";
    };

    // Calculate task position and height
    const getTaskStyle = (task: Task) => {
        if (!task.scheduled_start || !task.scheduled_end) return null;

        const start = new Date(task.scheduled_start);
        const end = new Date(task.scheduled_end);

        const startHour = start.getHours() + start.getMinutes() / 60;
        const endHour = end.getHours() + end.getMinutes() / 60;

        const range = Math.max(1, displayRange.end - displayRange.start);
        const top = ((startHour - displayRange.start) / range) * 100;
        const height = ((endHour - startHour) / range) * 100;

        return { top: `${top}%`, height: `${height}%` };
    };

    // Current time indicator
    const now = new Date();
    const currentHour = now.getHours() + now.getMinutes() / 60;
    const showCurrentTime = currentHour >= displayRange.start && currentHour <= displayRange.end;
    const currentTimePosition = ((currentHour - displayRange.start) / Math.max(1, displayRange.end - displayRange.start)) * 100;

    const priorityColors: Record<number, string> = {
        1: "bg-gray-300 border-gray-400",
        2: "bg-blue-200 border-blue-400",
        3: "bg-yellow-200 border-yellow-400",
        4: "bg-orange-200 border-orange-400",
        5: "bg-red-200 border-red-400",
    };

    return (
        <div className="bg-card border rounded-xl p-4 h-full overflow-hidden">
            <h2 className="text-sm font-medium mb-4">Today&apos;s Schedule</h2>

            <div className="relative h-[calc(100%-2rem)]">
                {/* Time grid */}
                <div className="absolute inset-0 flex flex-col">
                    {timeSlots.map(({ hour, label }) => (
                        <div
                            key={hour}
                            className={cn(
                                "flex-1 border-t border-border/50 relative",
                                getEnergyClass(hour)
                            )}
                        >
                            <span className="absolute -top-2.5 left-0 text-[10px] text-muted-foreground bg-card px-1">
                                {label}
                            </span>
                        </div>
                    ))}
                </div>

                {/* Current time indicator */}
                {showCurrentTime && (
                    <div
                        className="absolute left-8 right-0 flex items-center z-20 pointer-events-none"
                        style={{ top: `${currentTimePosition}%` }}
                    >
                        <div className="w-2 h-2 rounded-full bg-red-500 -ml-1" />
                        <div className="flex-1 h-px bg-red-500" />
                    </div>
                )}

                {/* Tasks */}
                <div className="absolute left-12 right-2 top-0 bottom-0">
                    {scheduledTasks.map((task) => {
                        const style = getTaskStyle(task);
                        if (!style) return null;

                        return (
                            <div
                                key={task.id}
                                className={cn(
                                    "absolute left-0 right-0 rounded-md border px-2 py-1 overflow-hidden cursor-pointer transition-all hover:shadow-md hover:z-10",
                                    priorityColors[task.priority],
                                    task.status === "in_progress" && "ring-2 ring-primary"
                                )}
                                style={style}
                            >
                                <p className="text-xs font-medium truncate">{task.title}</p>
                                {parseFloat(style.height) > 8 && (
                                    <p className="text-[10px] text-muted-foreground truncate">
                                        {task.scheduled_start && formatTime(task.scheduled_start)}
                                    </p>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {unscheduledTasks.length > 0 && (
                <div className="mt-4 border-t pt-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                        Unscheduled ({unscheduledTasks.length})
                    </p>
                    <div className="space-y-1">
                        {unscheduledTasks.map((task) => (
                            <div
                                key={task.id}
                                className="flex items-center justify-between text-xs bg-muted/50 rounded-md px-2 py-1"
                            >
                                <span className="truncate">{task.title}</span>
                                <span className="text-[10px] text-muted-foreground">P{task.priority}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function formatHour(hour: number): string {
    const suffix = hour >= 12 ? "PM" : "AM";
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour} ${suffix}`;
}
