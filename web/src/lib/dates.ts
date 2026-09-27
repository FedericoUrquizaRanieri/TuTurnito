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

export function todayStr(): string {
  return formatDate(new Date());
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
