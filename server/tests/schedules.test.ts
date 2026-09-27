import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app, resetDb, registerUser, createComplexForOwner, nextDateForDayOfWeek, configureCourts } from './helpers';

describe('schedules (courts and their ranges)', () => {
  beforeAll(async () => {
    await resetDb();
  });

  it('saves each court range and the generated turns follow it', async () => {
    const { agent: owner } = await registerUser('DUEÑO');
    const complex = await createComplexForOwner(owner);
    const [courtA, courtB] = complex.courts;

    const save = await configureCourts(owner, complex, {}, [
      { openTime: '09:00', closeTime: '12:00', slotMinutes: 90, basePrice: 15000 },
      { openTime: '18:00', closeTime: '22:00', slotMinutes: 60, basePrice: 16000 },
    ]);
    expect(save.status).toBe(200);

    const schedule = await owner.get(`/api/complexes/${complex.id}/schedule`);
    expect(schedule.status).toBe(200);
    const savedA = schedule.body.courts.find((c: any) => c.id === courtA.id);
    expect(savedA).toMatchObject({ openTime: '09:00', closeTime: '12:00', slotMinutes: 90, basePrice: 15000 });

    const date = nextDateForDayOfWeek(1);
    const turnsRes = await request(app).get(`/api/complexes/${complex.id}/turns`).query({ from: date, to: date });
    const startsA = turnsRes.body.turns.filter((t: any) => t.courtId === courtA.id).map((t: any) => t.startTime);
    const startsB = turnsRes.body.turns.filter((t: any) => t.courtId === courtB.id).map((t: any) => t.startTime);
    expect(startsA).toEqual(['09:00', '10:30']);
    expect(startsB).toEqual(['18:00', '19:00', '20:00', '21:00']);
    expect(turnsRes.body.turns.find((t: any) => t.courtId === courtB.id).price).toBe(16000);
  });

  it('rejects an invalid range with 400 instead of saving it', async () => {
    const { agent: owner } = await registerUser('DUEÑO');
    const complex = await createComplexForOwner(owner);

    const badFormat = await configureCourts(owner, complex, { openTime: '9:00' });
    expect(badFormat.status).toBe(400);
    expect(badFormat.body.error).toBeTruthy();

    const tooShort = await configureCourts(owner, complex, { openTime: '10:00', closeTime: '11:00', slotMinutes: 90 });
    expect(tooShort.status).toBe(400);

    const schedule = await owner.get(`/api/complexes/${complex.id}/schedule`);
    expect(schedule.body.courts[0].openTime).toBe('08:00'); // untouched default
  });

  it('rejects shrinking a range over a future reservation until resolveConflicts is given, then cancels it', async () => {
    const { agent: owner } = await registerUser('DUEÑO');
    const complex = await createComplexForOwner(owner);
    const [courtA] = complex.courts;

    await configureCourts(owner, complex, { openTime: '08:00', closeTime: '23:00', slotMinutes: 90 });

    const targetDate = nextDateForDayOfWeek(2);
    const turnsRes = await request(app).get(`/api/complexes/${complex.id}/turns`).query({ from: targetDate, to: targetDate });
    const turn = turnsRes.body.turns.find((t: any) => t.startTime === '20:00' && t.courtId === courtA.id);
    expect(turn).toBeDefined();

    const booking = await request(app)
      .post(`/api/turns/${turn.id}/reservations`)
      .send({ guestName: 'Test Guest', guestPhone: '2911234567' });
    expect(booking.status).toBe(201);

    // Closing at 18:00 leaves the 20:00 reservation out of range: rejected, nothing changed.
    const shrink = await configureCourts(owner, complex, { openTime: '08:00', closeTime: '18:00', slotMinutes: 90 });
    expect(shrink.status).toBe(409);
    expect(shrink.body.conflictType).toBe('RANGE_CHANGE');
    expect(shrink.body.conflicts[0].reservationId).toBe(booking.body.reservation.id);

    const unchanged = await owner.get(`/api/complexes/${complex.id}/schedule`);
    expect(unchanged.body.courts[0].closeTime).toBe('23:00');

    const resolved = await owner.put(`/api/complexes/${complex.id}/courts`).send({
      courts: complex.courts.map((c: any, i: number) => ({
        id: c.id, name: c.name, order: i, openTime: '08:00', closeTime: '18:00', slotMinutes: 90, basePrice: 12000,
      })),
      resolveConflicts: 'CANCEL',
    });
    expect(resolved.status).toBe(200);

    const turnsAfter = await request(app).get(`/api/complexes/${complex.id}/turns`).query({ from: targetDate, to: targetDate });
    const startsA = turnsAfter.body.turns.filter((t: any) => t.courtId === courtA.id).map((t: any) => t.startTime);
    expect(startsA).not.toContain('20:00');
    expect(startsA[startsA.length - 1]).toBe('15:30');
  });

  it('keeps an out-of-range reservation when resolved with KEEP', async () => {
    const { agent: owner } = await registerUser('DUEÑO');
    const complex = await createComplexForOwner(owner);
    const [courtA] = complex.courts;
    await configureCourts(owner, complex);

    const targetDate = nextDateForDayOfWeek(3);
    const turnsRes = await request(app).get(`/api/complexes/${complex.id}/turns`).query({ from: targetDate, to: targetDate });
    const turn = turnsRes.body.turns.find((t: any) => t.startTime === '21:30' && t.courtId === courtA.id);
    await request(app).post(`/api/turns/${turn.id}/reservations`).send({ guestName: 'Se Queda', guestPhone: '2911234567' });

    const resolved = await owner.put(`/api/complexes/${complex.id}/courts`).send({
      courts: complex.courts.map((c: any, i: number) => ({
        id: c.id, name: c.name, order: i, openTime: '08:00', closeTime: '18:00', slotMinutes: 90, basePrice: 12000,
      })),
      resolveConflicts: 'KEEP',
    });
    expect(resolved.status).toBe(200);

    const turnsAfter = await request(app).get(`/api/complexes/${complex.id}/turns`).query({ from: targetDate, to: targetDate });
    const kept = turnsAfter.body.turns.find((t: any) => t.id === turn.id);
    expect(kept.state).toBe('OCCUPIED');
    expect(kept.reservation.guestName).toBe('Se Queda');
  });
});
