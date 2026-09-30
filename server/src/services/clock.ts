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
