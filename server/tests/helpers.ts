import request from 'supertest';
import app from '../src/index';
import prisma from '../src/prisma';

export { app, prisma };

/** Wipes every table, in FK-safe order — same order as prisma/seed.ts. */
export async function resetDb() {
  await prisma.payment.deleteMany({});
  await prisma.reservationCancellation.deleteMany({});
  await prisma.matchPlayer.deleteMany({});
  await prisma.openMatch.deleteMany({});
  await prisma.reservation.deleteMany({});
  await prisma.turn.deleteMany({});
  await prisma.fixedBooking.deleteMany({});
  await prisma.closure.deleteMany({});
  await prisma.priceRule.deleteMany({});
  await prisma.classEnrollment.deleteMany({});
  await prisma.classSchedule.deleteMany({});
  await prisma.court.deleteMany({});
  await prisma.professorRequest.deleteMany({});
  await prisma.professorComplex.deleteMany({});
  await prisma.student.deleteMany({});
  await prisma.complex.deleteMany({});
  await prisma.user.deleteMany({});
}

let counter = 0;
export function uniqueEmail(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}@test.local`;
}

type Role = 'JUGADOR' | 'DUEÑO' | 'PROFESOR';

// Role names contain non-ASCII characters ('DUEÑO'), which zod's email
// validator rejects in the local part — use a plain-ASCII prefix instead.
const EMAIL_PREFIX: Record<Role, string> = {
  JUGADOR: 'player',
  DUEÑO: 'owner',
  PROFESOR: 'professor',
};

/**
 * Registers a user and returns a supertest agent that keeps the auth
 * cookie for subsequent requests, plus the created user payload.
 */
export async function registerUser(
  role: Role,
  overrides: Partial<{ name: string; email: string; password: string; phone: string }> = {}
) {
  const agent = request.agent(app);
  const email = overrides.email || uniqueEmail(EMAIL_PREFIX[role]);
  const password = overrides.password || 'test1234';

  const res = await agent.post('/api/auth/register').send({
    name: overrides.name || `Test ${role}`,
    email,
    password,
    phone: overrides.phone || '2914567890',
    role,
  });

  return { agent, user: res.body.user, res };
}

/** Creates a complex (with its 2 default courts) owned by the given agent. */
export async function createComplexForOwner(
  agent: ReturnType<typeof request.agent>,
  overrides: Partial<{ name: string; location: string; address: string }> = {}
) {
  const res = await agent.post('/api/complexes').send({
    name: overrides.name || 'Complejo de Test',
    location: overrides.location || 'Bahía Blanca',
    address: overrides.address || 'Calle Falsa 123',
  });
  return res.body.complex;
}

/** Next calendar date (YYYY-MM-DD) that falls on the given day of week, at least 1 day out. */
export function nextDateForDayOfWeek(dayOfWeek: number): string {
  const d = new Date();
  const diff = (dayOfWeek - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

type CourtRange = { openTime: string; closeTime: string; slotMinutes: number; basePrice: number };

/** Saves the complex's courts with the given range (same for every court unless overridden per index). */
export async function configureCourts(
  agent: ReturnType<typeof request.agent>,
  complex: { id: string; courts: { id: string; name: string }[] },
  range: Partial<CourtRange> = {},
  perCourt: Partial<CourtRange>[] = []
) {
  const base: CourtRange = { openTime: '08:00', closeTime: '23:00', slotMinutes: 90, basePrice: 12000, ...range };
  return agent.put(`/api/complexes/${complex.id}/courts`).send({
    courts: complex.courts.map((c, i) => ({ id: c.id, name: c.name, order: i, ...base, ...(perCourt[i] || {}) })),
  });
}

/** Today shifted by N days, as YYYY-MM-DD. */
export function dateFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
