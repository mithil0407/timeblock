export interface ZonedDateParts {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
}

export function getZonedDateParts(date: Date, timeZone: string): ZonedDateParts {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    }).formatToParts(date);

    const getPart = (type: string) => {
        const part = parts.find((p) => p.type === type)?.value;
        return part ? parseInt(part, 10) : 0;
    };

    return {
        year: getPart("year"),
        month: getPart("month"),
        day: getPart("day"),
        hour: getPart("hour"),
        minute: getPart("minute"),
        second: getPart("second"),
    };
}

export function getTimeZoneOffsetMinutes(date: Date, timeZone: string): number {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        timeZoneName: "shortOffset",
    }).formatToParts(date);

    const tzName = parts.find((p) => p.type === "timeZoneName")?.value || "GMT";
    const match = tzName.match(/GMT([+-]\d{1,2})(?::(\d{2}))?/);

    if (!match) return 0;
    const sign = match[1].startsWith("-") ? -1 : 1;
    const hours = Math.abs(parseInt(match[1], 10));
    const minutes = match[2] ? parseInt(match[2], 10) : 0;
    return sign * (hours * 60 + minutes);
}

export function zonedTimeToUtc(parts: ZonedDateParts, timeZone: string): Date {
    const utcMs = Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute,
        parts.second
    );
    const offsetMinutes = getTimeZoneOffsetMinutes(new Date(utcMs), timeZone);
    return new Date(utcMs - offsetMinutes * 60 * 1000);
}

export function addDaysInTimeZone(date: Date, timeZone: string, days: number): Date {
    const zonedParts = getZonedDateParts(date, timeZone);
    const base = zonedTimeToUtc(
        { ...zonedParts, hour: 12, minute: 0, second: 0 },
        timeZone
    );
    const next = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
    return next;
}

export function getStartOfDayInTimeZone(date: Date, timeZone: string): Date {
    const parts = getZonedDateParts(date, timeZone);
    return zonedTimeToUtc(
        { ...parts, hour: 0, minute: 0, second: 0 },
        timeZone
    );
}

export function getEndOfDayInTimeZone(date: Date, timeZone: string): Date {
    const parts = getZonedDateParts(date, timeZone);
    return zonedTimeToUtc(
        { ...parts, hour: 23, minute: 59, second: 59 },
        timeZone
    );
}

export function getDateKeyInTimeZone(date: Date, timeZone: string): string {
    const { year, month, day } = getZonedDateParts(date, timeZone);
    const mm = String(month).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    return `${year}-${mm}-${dd}`;
}
