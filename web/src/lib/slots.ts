// Mirrors buildCourtSlots() in server/src/services/schedule.service.ts: a
// court's daily turns run from openTime to closeTime in slotMinutes blocks,
// and the last one must fit entirely.

export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function fromMinutes(total: number): string {
  const wrapped = total % (24 * 60);
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

export function buildCourtSlots(court: { openTime: string; closeTime: string; slotMinutes: number }) {
  const slots: { start: string; end: string }[] = [];
  if (!court.slotMinutes || court.slotMinutes <= 0) return slots;
  const close = toMinutes(court.closeTime);
  for (let m = toMinutes(court.openTime); m + court.slotMinutes <= close; m += court.slotMinutes) {
    slots.push({ start: fromMinutes(m), end: fromMinutes(m + court.slotMinutes) });
  }
  return slots;
}
