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
        timeZone = "Asia/Kolkata",
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
            timeZone: existingEvent.data.start?.timeZone || "Asia/Kolkata",
        };
    }

    if (updates.end) {
        updatedEvent.end = {
            dateTime: updates.end.toISOString(),
            timeZone: existingEvent.data.end?.timeZone || "Asia/Kolkata",
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
    durationMinutes: number
): Promise<FreeSlot[]> {
    const events = await listEvents(auth, startTime, endTime);

    const freeSlots: FreeSlot[] = [];
    let currentTime = new Date(startTime);

    // Sort events by start time
    const sortedEvents = events
        .filter((e) => e.start?.dateTime)
        .sort((a, b) => {
            const aStart = new Date(a.start!.dateTime!);
            const bStart = new Date(b.start!.dateTime!);
            return aStart.getTime() - bStart.getTime();
        });

    for (const event of sortedEvents) {
        const eventStart = new Date(event.start!.dateTime!);
        const eventEnd = new Date(event.end!.dateTime!);

        // Check if there's a gap before this event
        const gapMinutes = (eventStart.getTime() - currentTime.getTime()) / (1000 * 60);

        if (gapMinutes >= durationMinutes) {
            freeSlots.push({
                start: new Date(currentTime),
                end: new Date(currentTime.getTime() + durationMinutes * 60 * 1000),
            });
        }

        // Move current time to after this event
        if (eventEnd > currentTime) {
            currentTime = eventEnd;
        }
    }

    // Check for gap after last event
    const finalGapMinutes = (endTime.getTime() - currentTime.getTime()) / (1000 * 60);
    if (finalGapMinutes >= durationMinutes) {
        freeSlots.push({
            start: new Date(currentTime),
            end: new Date(currentTime.getTime() + durationMinutes * 60 * 1000),
        });
    }

    return freeSlots;
}
