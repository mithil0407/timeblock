import { findFreeSlots, type FreeSlot } from "./google-calendar";
import type { Task, UserMemory, EnergyLevelMemory } from "./types";
import { OAuth2Client } from "google-auth-library";
import {
    addDaysInTimeZone,
    getEndOfDayInTimeZone,
    getStartOfDayInTimeZone,
    getZonedDateParts,
    zonedTimeToUtc,
} from "./timezone";

interface EnergyMap {
    [timeRange: string]: EnergyLevelMemory;
}

interface WorkingHours {
    start: number;
    end: number;
    maxExtension?: number;
}

function getEnergyForTimeSlot(
    slot: FreeSlot,
    energyMap: EnergyMap,
    timeZone: string
): "high" | "medium" | "low" {
    const hour = getZonedDateParts(slot.start, timeZone).hour;

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
    existingTasks: Task[],
    bufferMinutes: number
): boolean {
    const bufferMs = Math.max(0, bufferMinutes) * 60 * 1000;

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
    ignoreEventIds,
    busySlots,
    timeZone,
    maxDaysAhead = 7,
}: {
    auth: OAuth2Client;
    duration: number;
    priority: number;
    energyRequirement: "high" | "medium" | "low";
    userMemory: UserMemory[];
    existingTasks: Task[];
    ignoreEventIds?: string[];
    busySlots?: FreeSlot[];
    timeZone?: string;
    maxDaysAhead?: number;
}): Promise<FreeSlot | null> {
    const preferences = getPreferences(userMemory);
    const resolvedTimeZone = timeZone || preferences.timeZone || "UTC";
    const bufferMinutes = preferences.bufferBetweenTasksMinutes ?? 5;

    // Get working hours from memory
    const workingHoursMemory = userMemory.find(
        (m) => m.memory_type === "working_hours"
    );
    const workingHours: WorkingHours = (workingHoursMemory?.value as unknown as WorkingHours) || {
        start: 9,
        end: 18,
        maxExtension: 3,
    };

    // Get energy levels from memory
    const energyLevelsMemory = userMemory.filter(
        (m) => m.memory_type === "energy_levels"
    );
    const energyMap: EnergyMap = {};
    for (const mem of energyLevelsMemory) {
        energyMap[mem.key] = mem.value as unknown as EnergyLevelMemory;
    }

    const now = new Date();
    const derivedBusySlots = buildBusySlots(existingTasks, bufferMinutes);
    const combinedBusySlots = [...(busySlots || []), ...derivedBusySlots];

    for (let dayOffset = 0; dayOffset <= maxDaysAhead; dayOffset += 1) {
        const targetDate = addDaysInTimeZone(now, resolvedTimeZone, dayOffset);
        const targetParts = getZonedDateParts(targetDate, resolvedTimeZone);

        let startTime = zonedTimeToUtc(
            {
                ...targetParts,
                hour: workingHours.start,
                minute: 0,
                second: 0,
            },
            resolvedTimeZone
        );
        const endTime = zonedTimeToUtc(
            {
                ...targetParts,
                hour: workingHours.end,
                minute: 0,
                second: 0,
            },
            resolvedTimeZone
        );

        if (dayOffset === 0 && now > startTime) {
            startTime = new Date(now.getTime() + bufferMinutes * 60 * 1000);
        }

        if (startTime >= endTime) {
            continue;
        }

        const freeSlots = await findFreeSlots(auth, startTime, endTime, duration, {
            ignoreEventIds,
            busySlots: combinedBusySlots,
        });

        let availableSlots = freeSlots;
        if (availableSlots.length === 0) {
            const maxExtension = workingHours.maxExtension ?? 3;
            const extendedEndTime = new Date(endTime.getTime() + maxExtension * 60 * 60 * 1000);
            availableSlots = await findFreeSlots(auth, endTime, extendedEndTime, duration, {
                ignoreEventIds,
                busySlots: combinedBusySlots,
            });
        }

        if (availableSlots.length === 0) {
            continue;
        }

        const scoredSlots = availableSlots.map((slot) => {
            let score = 0;

            // Energy match: +10 points if slot energy matches requirement
            const slotEnergy = getEnergyForTimeSlot(slot, energyMap, resolvedTimeZone);
            if (slotEnergy === energyRequirement) score += 10;
            else if (slotEnergy === "high" && energyRequirement === "medium") score += 5;

            // Earlier is better for high priority: +5 points for morning
            const slotHour = getZonedDateParts(slot.start, resolvedTimeZone).hour;
            if (priority >= 4 && slotHour < 12) score += 5;

            // Proximity to existing tasks: +3 points if adjacent (minimize context switching)
            if (isAdjacentToExistingTask(slot, existingTasks, bufferMinutes)) score += 3;

            // Sooner is better for urgent tasks
            const hoursFromNow = (slot.start.getTime() - Date.now()) / (1000 * 60 * 60);
            if (priority >= 4) score += Math.max(0, 10 - hoursFromNow);

            return { slot, score };
        });

        scoredSlots.sort((a, b) => b.score - a.score);
        return scoredSlots[0]?.slot || null;
    }

    return null;
}

export function getStartOfDay(date: Date = new Date(), timeZone?: string): Date {
    if (!timeZone) {
        const start = new Date(date);
        start.setHours(0, 0, 0, 0);
        return start;
    }
    return getStartOfDayInTimeZone(date, timeZone);
}

export function getEndOfDay(date: Date = new Date(), timeZone?: string): Date {
    if (!timeZone) {
        const end = new Date(date);
        end.setHours(23, 59, 59, 999);
        return end;
    }
    return getEndOfDayInTimeZone(date, timeZone);
}

function buildBusySlots(tasks: Task[], bufferMinutes: number): FreeSlot[] {
    const bufferMs = Math.max(0, bufferMinutes) * 60 * 1000;
    return tasks
        .filter((task) => task.scheduled_start && task.scheduled_end)
        .map((task) => {
            const start = new Date(task.scheduled_start as string).getTime() - bufferMs;
            const end = new Date(task.scheduled_end as string).getTime() + bufferMs;
            return {
                start: new Date(start),
                end: new Date(end),
            };
        });
}

function getPreferences(userMemory: UserMemory[]): {
    timeZone?: string;
    bufferBetweenTasksMinutes?: number;
} {
    const preferences = userMemory.filter((m) => m.memory_type === "preferences");
    const aggregated: Record<string, unknown> = {};
    for (const pref of preferences) {
        aggregated[pref.key] = pref.value;
    }

    let timeZone: string | undefined;
    const directTimeZone = aggregated.timezone;
    if (typeof directTimeZone === "string") {
        timeZone = directTimeZone;
    } else if (directTimeZone && typeof directTimeZone === "object") {
        timeZone = (directTimeZone as { timezone?: string }).timezone;
    }

    if (!timeZone) {
        timeZone = (aggregated.default as { timezone?: string } | undefined)?.timezone;
    }

    let bufferBetweenTasksMinutes: number | undefined;
    const directBuffer = aggregated.buffer_between_tasks_minutes;
    if (typeof directBuffer === "number") {
        bufferBetweenTasksMinutes = directBuffer;
    } else if (directBuffer && typeof directBuffer === "object") {
        bufferBetweenTasksMinutes = (directBuffer as { minutes?: number }).minutes;
    }

    if (bufferBetweenTasksMinutes === undefined) {
        bufferBetweenTasksMinutes = (aggregated.default as { buffer_between_tasks_minutes?: number } | undefined)
            ?.buffer_between_tasks_minutes;
    }

    return {
        timeZone,
        bufferBetweenTasksMinutes,
    };
}
