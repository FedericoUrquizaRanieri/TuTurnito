// Every "today" / "now" of the app is read here, in the app's timezone
// (Argentina by default), never in the server's: a server running in UTC
// would otherwise flip to tomorrow at 21:00 local time.
export const APP_TIMEZONE = process.env.APP_TIMEZONE || 'America/Argentina/Buenos_Aires';

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export interface NowParts {
  today: string; // "YYYY-MM-DD"
  time: string; // "HH:MM"
}

/** Current date and time in the app's timezone. */
export function nowParts(): NowParts {
  const parts = Object.fromEntries(formatter.formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { today: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/** Today's date ("YYYY-MM-DD") in the app's timezone. */
export function today(): string {
  return nowParts().today;
}

/** A turn or class counts as started (can't be booked or cancelled, and is charged) once its start time is reached. */
export function hasStarted(date: string, startTime: string, now: NowParts = nowParts()): boolean {
  return date < now.today || (date === now.today && startTime <= now.time);
}

/** Minutes from now until the given local date and time (negative once it passed). */
export function minutesUntil(date: string, time: string, now: NowParts = nowParts()): number {
  const toEpochMinutes = (d: string, t: string) => {
    const [y, m, day] = d.split('-').map(Number);
    const [h, min] = t.split(':').map(Number);
    return Date.UTC(y, m - 1, day, h, min) / 60000;
  };
  return toEpochMinutes(date, time) - toEpochMinutes(now.today, now.time);
}

/** The local date and time ("YYYY-MM-DD", "HH:MM") that is `minutes` before the given one. */
export function minutesBefore(date: string, time: string, minutes: number): NowParts {
  const [y, m, day] = date.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  const d = new Date(Date.UTC(y, m - 1, day, h, min) - minutes * 60000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    today: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
  };
}
