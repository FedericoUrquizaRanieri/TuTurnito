import request from 'supertest';
import app from '../src/index';
import prisma from '../src/prisma';

export { app, prisma };

/** Wipes every table, in FK-safe order — same order as prisma/seed.ts. */
export async function resetDb() {
  await prisma.payment.deleteMany({});
  await prisma.reservation.deleteMany({});
  await prisma.turn.deleteMany({});
  await prisma.templateCell.deleteMany({});
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
