import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { app, prisma, resetDb, registerUser, createComplexForOwner, configureCourts, dateFromToday } from './helpers';

/** Freezes `new Date()` (server included, it runs in-process) at today + dayOffset, HH:MM local time. */
function setNow(time: string, dayOffset = 0) {
  vi.useFakeTimers({ toFake: ['Date'] });
  const d = new Date(vi.getRealSystemTime());
  const [h, m] = time.split(':').map(Number);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  vi.setSystemTime(d);
}

async function setup(cancellationHours: number) {
  const { agent: owner } = await registerUser('DUEÑO');
  const complex = await createComplexForOwner(owner);
  await configureCourts(owner, complex, { openTime: '08:00', closeTime: '23:00', slotMinutes: 60, basePrice: 10000 });
  const upd = await owner.put(`/api/complexes/${complex.id}`).send({ cancellationHours, phone: '2914000000' });
  expect(upd.status).toBe(200);
  expect(upd.body.complex.cancellationHours).toBe(cancellationHours);
  const { agent: player } = await registerUser('JUGADOR');
  return { owner, complex, court: complex.courts[0], player };
}

async function book(agent: any, complexId: string, courtId: string, date: string, startTime: string) {
  const turns = (await request(app).get(`/api/complexes/${complexId}/turns`).query({ from: date, to: date })).body.turns;
  const turn = turns.find((t: any) => t.courtId === courtId && t.startTime === startTime);
  const res = await agent.post(`/api/turns/${turn.id}/reservations`).send({ guestName: 'Jugador', guestPhone: '2911234567' });
  expect(res.status).toBe(201);
  return res.body.reservation;
}

describe('cancellation policy', () => {
  beforeAll(async () => {
    await resetDb();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lets the player cancel before the deadline and records the cancellation', async () => {
    setNow('10:00');
    const { complex, court, player } = await setup(24);
    const tomorrow = dateFromToday(1);
    const r = await book(player, complex.id, court.id, tomorrow, '12:00'); // 26 h ahead

    const mine = (await player.get('/api/reservations/my')).body.reservations.find((x: any) => x.id === r.id);
    expect(mine.canCancel).toBe(true);
    expect(mine.cancelDeadline).toEqual({ date: dateFromToday(0), time: '12:00' });

    expect((await player.delete(`/api/reservations/${r.id}`)).status).toBe(200);
    const log = await prisma.reservationCancellation.findFirst({ where: { complexId: complex.id } });
    expect(log).toMatchObject({ cancelledBy: 'PLAYER', date: tomorrow, startTime: '12:00', price: 10000, minutesBefore: 26 * 60 });
  });

  it('rejects a player cancellation after the deadline, but the owner can still cancel', async () => {
    setNow('10:00');
    const { owner, complex, court, player } = await setup(24);
    const r = await book(player, complex.id, court.id, dateFromToday(1), '09:00'); // 23 h ahead

    const mine = (await player.get('/api/reservations/my')).body.reservations.find((x: any) => x.id === r.id);
    expect(mine.canCancel).toBe(false);

    const res = await player.delete(`/api/reservations/${r.id}`);
    expect(res.status).toBe(409);
    expect(res.body.error || res.body.message).toContain('2914000000');

    expect((await owner.delete(`/api/reservations/${r.id}`)).status).toBe(200);
    const log = await prisma.reservationCancellation.findFirst({ where: { complexId: complex.id } });
    expect(log?.cancelledBy).toBe('OWNER');
  });

  it('without a policy the player can cancel until the turn starts', async () => {
    setNow('10:00');
    const { complex, court, player } = await setup(0);
    const r = await book(player, complex.id, court.id, dateFromToday(0), '11:00');
    expect((await player.delete(`/api/reservations/${r.id}`)).status).toBe(200);
  });
});
