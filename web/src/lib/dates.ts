// Local-calendar date helpers working on "YYYY-MM-DD" strings, the same
// format the backend uses for Turn.date.

export function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// "Today" and "now" follow Argentina's time, same as the server, whatever
// the timezone of the device.
const APP_TIMEZONE = 'America/Argentina/Buenos_Aires';
const nowFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function nowParts(): { today: string; time: string } {
  const p = Object.fromEntries(nowFormatter.formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { today: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

export function todayStr(): string {
  return nowParts().today;
}

/** A turn or class has started once its start time is reached (it can't be booked or cancelled anymore). */
export function hasStarted(date: string, startTime: string): boolean {
  const now = nowParts();
  return date < now.today || (date === now.today && startTime <= now.time);
}

export function addDays(dateStr: string, days: number): string {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + days);
  return formatDate(d);
}

/** Monday–Sunday of the week containing `dateStr`. */
export function weekRange(dateStr: string): { from: string; to: string } {
  const dow = parseDate(dateStr).getDay(); // 0 = Sunday
  const from = addDays(dateStr, dow === 0 ? -6 : 1 - dow);
  return { from, to: addDays(from, 6) };
}

export const DAY_NAMES_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
export const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/** "Mié 1 oct" style label. */
export function shortDateLabel(dateStr: string): string {
  const d = parseDate(dateStr);
  return `${DAY_NAMES_SHORT[d.getDay()]} ${d.getDate()} ${d.toLocaleString('es-AR', { month: 'short' })}`;
}
