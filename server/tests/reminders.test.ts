import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { app, prisma, resetDb, registerUser, createComplexForOwner, configureCourts, dateFromToday } from './helpers';
import { runReminderSweep } from '../src/jobs/reminders';
import { outbox } from '../src/services/mailer';

/** Freezes `new Date()` at today + dayOffset, HH:MM local time. */
function setNow(time: string, dayOffset = 0) {
  vi.useFakeTimers({ toFake: ['Date'] });
  const d = new Date(vi.getRealSystemTime());
  const [h, m] = time.split(':').map(Number);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  vi.setSystemTime(d);
}

async function setup() {
  const { agent: owner } = await registerUser('DUEÑO');
  const complex = await createComplexForOwner(owner);
  await configureCourts(owner, complex, { openTime: '08:00', closeTime: '23:00', slotMinutes: 60, basePrice: 10000 });
  return { owner, complex, court: complex.courts[0] };
}

async function book(agent: any, complexId: string, courtId: string, date: string, startTime: string, body: object = {}) {
  const turns = (await request(app).get(`/api/complexes/${complexId}/turns`).query({ from: date, to: date })).body.turns;
  const turn = turns.find((t: any) => t.courtId === courtId && t.startTime === startTime);
  const res = await agent.post(`/api/turns/${turn.id}/reservations`).send({ guestName: 'Jugador', guestPhone: '2911234567', ...body });
  expect(res.status).toBe(201);
  return res.body.reservation;
}

describe('email reminders', () => {
  beforeAll(async () => {
    await resetDb();
  });
  beforeEach(() => {
    outbox.length = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends one reminder to the player within 24 h of the turn, only once', async () => {
    setNow('09:00');
    const { complex, court } = await setup();
    const { agent: player, user } = await registerUser('JUGADOR', { name: 'Lucía' });
    await book(player, complex.id, court.id, dateFromToday(1), '10:00');

    // 25 h before: too early.
    await runReminderSweep();
    expect(outbox.filter((m) => m.to === user.email)).toHaveLength(0);

    setNow('11:00'); // 23 h before
    await Promise.all([runReminderSweep(), runReminderSweep()]);
    const mine = outbox.filter((m) => m.to === user.email);
    expect(mine).toHaveLength(1);
    expect(mine[0].subject).toContain('10:00');
    expect(mine[0].text).toContain('Lucía');

    await runReminderSweep();
    expect(outbox.filter((m) => m.to === user.email)).toHaveLength(1);
  });

  it('skips players who turned reminders off, clients without email and last-minute bookings', async () => {
    setNow('09:00');
    const { owner, complex, court } = await setup();
    const { agent: optedOut, user: optedOutUser } = await registerUser('JUGADOR');
    expect((await optedOut.put('/api/auth/me').send({ emailReminders: false })).body.user.emailReminders).toBe(false);
    await book(optedOut, complex.id, court.id, dateFromToday(1), '08:00');

    // Clients the owner booked for (by phone or at the counter).
    const guest = await book(owner, complex.id, court.id, dateFromToday(1), '09:00');
    const guestWithEmail = await book(owner, complex.id, court.id, dateFromToday(0), '10:00', { guestEmail: 'guest@test.local' });

    setNow('09:30');
    await runReminderSweep();
    expect(outbox.some((m) => m.to === optedOutUser.email)).toBe(false);
    // Booked 1 h before it starts: no reminder needed.
    expect(outbox.some((m) => m.to === 'guest@test.local')).toBe(false);
    expect((await prisma.reservation.findUnique({ where: { id: guest.id } }))?.reminderSentAt).toBeNull();
    expect((await prisma.reservation.findUnique({ where: { id: guestWithEmail.id } }))?.reminderSentAt).toBeNull();
  });

  it('reminds a client the owner booked for with an email', async () => {
    setNow('08:00');
    const { owner, complex, court } = await setup();
    await book(owner, complex.id, court.id, dateFromToday(0), '20:00', { guestEmail: 'invitada@test.local', guestName: 'Invitada' });
    await runReminderSweep();
    expect(outbox.filter((m) => m.to === 'invitada@test.local')).toHaveLength(1);
  });
});
