import { google, calendar_v3 } from "googleapis";
import { OAuth2Client } from "google-auth-library";

export async function getCalendar(auth: OAuth2Client) {
    return google.calendar({ version: "v3", auth });
}

export async function listEvents(
    auth: OAuth2Client,
    timeMin: Date,
    timeMax: Date
): Promise<calendar_v3.Schema$Event[]> {
    const calendar = await getCalendar(auth);

    const response = await calendar.events.list({
        calendarId: "primary",
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
    });

    return response.data.items || [];
}

export async function createEvent(
    auth: OAuth2Client,
    {
        summary,
        description,
        start,
        end,
        timeZone = "UTC",
    }: {
        summary: string;
        description?: string;
        start: Date;
        end: Date;
        timeZone?: string;
    }
): Promise<string> {
    const calendar = await getCalendar(auth);

    const event: calendar_v3.Schema$Event = {
        summary,
        description,
        start: {
            dateTime: start.toISOString(),
            timeZone,
        },
        end: {
            dateTime: end.toISOString(),
            timeZone,
        },
        colorId: "9", // Blue color for time-blocked tasks
        reminders: {
            useDefault: false,
            overrides: [{ method: "popup", minutes: 10 }],
        },
    };

    const response = await calendar.events.insert({
        calendarId: "primary",
        requestBody: event,
    });

    return response.data.id || "";
}

export async function updateEvent(
    auth: OAuth2Client,
    eventId: string,
    updates: {
        summary?: string;
        description?: string;
        start?: Date;
        end?: Date;
    }
): Promise<void> {
    const calendar = await getCalendar(auth);

    // First get the existing event
    const existingEvent = await calendar.events.get({
        calendarId: "primary",
        eventId: eventId,
    });

    // Merge updates
    const updatedEvent: calendar_v3.Schema$Event = {
        ...existingEvent.data,
        summary: updates.summary || existingEvent.data.summary,
        description: updates.description || existingEvent.data.description,
    };

    if (updates.start) {
        updatedEvent.start = {
            dateTime: updates.start.toISOString(),
            timeZone: existingEvent.data.start?.timeZone || "UTC",
        };
    }

    if (updates.end) {
        updatedEvent.end = {
            dateTime: updates.end.toISOString(),
            timeZone: existingEvent.data.end?.timeZone || "UTC",
        };
    }

    await calendar.events.update({
        calendarId: "primary",
        eventId: eventId,
        requestBody: updatedEvent,
    });
}

export async function deleteEvent(
    auth: OAuth2Client,
    eventId: string
): Promise<void> {
    const calendar = await getCalendar(auth);

    await calendar.events.delete({
        calendarId: "primary",
        eventId: eventId,
    });
}

export interface FreeSlot {
    start: Date;
    end: Date;
}

export async function findFreeSlots(
    auth: OAuth2Client,
    startTime: Date,
    endTime: Date,
    durationMinutes: number,
    options?: { ignoreEventIds?: string[]; busySlots?: FreeSlot[] }
): Promise<FreeSlot[]> {
    const events = await listEvents(auth, startTime, endTime);
    const ignoreIds = new Set(options?.ignoreEventIds || []);

    const intervals: Array<{ start: Date; end: Date }> = [];

    for (const event of events) {
        if (event.id && ignoreIds.has(event.id)) continue;
        if (!event.start?.dateTime || !event.end?.dateTime) continue;
        intervals.push({
            start: new Date(event.start.dateTime),
            end: new Date(event.end.dateTime),
        });
    }

    for (const slot of options?.busySlots || []) {
        intervals.push({ start: new Date(slot.start), end: new Date(slot.end) });
    }

    const sortedIntervals = intervals.sort((a, b) => a.start.getTime() - b.start.getTime());

    const freeSlots: FreeSlot[] = [];
    let currentTime = new Date(startTime);

    for (const interval of sortedIntervals) {
        if (interval.end <= currentTime) continue;

        const gapMinutes = (interval.start.getTime() - currentTime.getTime()) / (1000 * 60);
        if (gapMinutes >= durationMinutes) {
            freeSlots.push({
                start: new Date(currentTime),
                end: new Date(currentTime.getTime() + durationMinutes * 60 * 1000),
            });
        }

        if (interval.end > currentTime) {
            currentTime = interval.end;
        }
    }

    const finalGapMinutes = (endTime.getTime() - currentTime.getTime()) / (1000 * 60);
    if (finalGapMinutes >= durationMinutes) {
        freeSlots.push({
            start: new Date(currentTime),
            end: new Date(currentTime.getTime() + durationMinutes * 60 * 1000),
        });
    }

    return freeSlots;
}
