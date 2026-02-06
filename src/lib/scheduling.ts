import { findFreeSlots, type FreeSlot } from "./google-calendar";
import type { Task, UserMemory, EnergyLevelMemory } from "./types";
import { OAuth2Client } from "google-auth-library";

interface EnergyMap {
    [timeRange: string]: EnergyLevelMemory;
}

interface WorkingHours {
    start: number;
    end: number;
}

function getEnergyForTimeSlot(
    slot: FreeSlot,
    energyMap: EnergyMap
): "high" | "medium" | "low" {
    const hour = slot.start.getHours();

    for (const [timeRange, energyData] of Object.entries(energyMap)) {
        const [startStr, endStr] = timeRange.split("-");
        const startHour = parseInt(startStr.split(":")[0], 10);
        const endHour = parseInt(endStr.split(":")[0], 10);

        if (hour >= startHour && hour < endHour) {
            return energyData.level;
        }
    }

    // Default to medium if no match
    return "medium";
}

function isAdjacentToExistingTask(
    slot: FreeSlot,
    existingTasks: Task[]
): boolean {
    const bufferMs = 5 * 60 * 1000; // 5 minutes buffer

    for (const task of existingTasks) {
        if (!task.scheduled_start || !task.scheduled_end) continue;

        const taskStart = new Date(task.scheduled_start);
        const taskEnd = new Date(task.scheduled_end);

        // Check if slot starts right after task ends or ends right before task starts
        if (
            Math.abs(slot.start.getTime() - taskEnd.getTime()) < bufferMs ||
            Math.abs(slot.end.getTime() - taskStart.getTime()) < bufferMs
        ) {
            return true;
        }
    }

    return false;
}

export function calculatePriority({
    deadline,
    taskType,
    existingTasks,
}: {
    deadline: string | null;
    taskType: string;
    existingTasks: Task[];
}): number {
    let score = 3; // Base priority

    // Deadline urgency (most important factor)
    if (deadline) {
        const deadlineDate = new Date(deadline);
        const hoursUntilDeadline = (deadlineDate.getTime() - Date.now()) / (1000 * 60 * 60);

        if (hoursUntilDeadline <= 4) score = 5; // Due within 4 hours
        else if (hoursUntilDeadline <= 24) score = 4; // Due today
        else if (hoursUntilDeadline <= 48) score = 3; // Due tomorrow
        else if (hoursUntilDeadline <= 168) score = 2; // Due this week
        else score = 1; // Due later
    }

    // Task type consideration
    const sameTypeTasks = existingTasks.filter((t) => t.task_category === taskType);
    if (sameTypeTasks.length === 0 && taskType === "client_work") {
        score = Math.min(5, score + 1); // Boost client work slightly
    }

    return Math.max(1, Math.min(5, score)); // Clamp between 1-5
}

export async function findOptimalSlot({
    auth,
    duration,
    priority,
    energyRequirement,
    userMemory,
    existingTasks,
}: {
    auth: OAuth2Client;
    duration: number;
    priority: number;
    energyRequirement: "high" | "medium" | "low";
    userMemory: UserMemory[];
    existingTasks: Task[];
}): Promise<FreeSlot | null> {
    // Get working hours from memory
    const workingHoursMemory = userMemory.find(
        (m) => m.memory_type === "working_hours"
    );
    const workingHours: WorkingHours = workingHoursMemory?.value as WorkingHours || {
        start: 9,
        end: 18,
    };

    // Get energy levels from memory
    const energyLevelsMemory = userMemory.filter(
        (m) => m.memory_type === "energy_levels"
    );
    const energyMap: EnergyMap = {};
    for (const mem of energyLevelsMemory) {
        energyMap[mem.key] = mem.value as EnergyLevelMemory;
    }

    // Set up time range for today
    const today = new Date();
    const startTime = new Date(today);
    startTime.setHours(workingHours.start, 0, 0, 0);

    // If current time is after start time, use current time + 5 min buffer
    const now = new Date();
    if (now > startTime) {
        startTime.setTime(now.getTime() + 5 * 60 * 1000);
    }

    const endTime = new Date(today);
    endTime.setHours(workingHours.end, 0, 0, 0);

    // Find free slots
    const freeSlots = await findFreeSlots(auth, startTime, endTime, duration);

    if (freeSlots.length === 0) {
        // Try extending working hours
        const extendedEndTime = new Date(today);
        extendedEndTime.setHours(workingHours.end + 3, 0, 0, 0); // Max 3 hours extension

        const extendedSlots = await findFreeSlots(auth, endTime, extendedEndTime, duration);
        if (extendedSlots.length > 0) {
            return extendedSlots[0];
        }

        // No slots available today
        return null;
    }

    // Score each slot
    const scoredSlots = freeSlots.map((slot) => {
        let score = 0;

        // Energy match: +10 points if slot energy matches requirement
        const slotEnergy = getEnergyForTimeSlot(slot, energyMap);
        if (slotEnergy === energyRequirement) score += 10;
        else if (slotEnergy === "high" && energyRequirement === "medium") score += 5;

        // Earlier is better for high priority: +5 points for morning
        if (priority >= 4 && slot.start.getHours() < 12) score += 5;

        // Proximity to existing tasks: +3 points if adjacent (minimize context switching)
        if (isAdjacentToExistingTask(slot, existingTasks)) score += 3;

        // Sooner is better for urgent tasks
        const hoursFromNow = (slot.start.getTime() - Date.now()) / (1000 * 60 * 60);
        if (priority >= 4) score += Math.max(0, 10 - hoursFromNow);

        return { slot, score };
    });

    // Return highest scoring slot
    scoredSlots.sort((a, b) => b.score - a.score);
    return scoredSlots[0]?.slot || null;
}

export function getStartOfDay(date: Date = new Date()): Date {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    return start;
}

export function getEndOfDay(date: Date = new Date()): Date {
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    return end;
}
