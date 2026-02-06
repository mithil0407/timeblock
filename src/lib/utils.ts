import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function formatTime(date: Date | string): string {
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    });
}

export function formatDate(date: Date | string): string {
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
    });
}

export function formatDuration(minutes: number): string {
    if (minutes < 60) {
        return `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

export function getEnergyLevelColor(level: string): string {
    switch (level) {
        case "high":
            return "bg-energy-high";
        case "medium":
            return "bg-energy-medium";
        case "low":
            return "bg-energy-low";
        default:
            return "bg-muted";
    }
}

export function getPriorityColor(priority: number): string {
    const colors: Record<number, string> = {
        1: "bg-priority-1",
        2: "bg-priority-2",
        3: "bg-priority-3",
        4: "bg-priority-4",
        5: "bg-priority-5",
    };
    return colors[priority] || colors[3];
}

export function getPriorityLabel(priority: number): string {
    const labels: Record<number, string> = {
        1: "Low",
        2: "Normal",
        3: "Medium",
        4: "High",
        5: "Urgent",
    };
    return labels[priority] || "Medium";
}
