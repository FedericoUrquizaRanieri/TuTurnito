import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app, resetDb, registerUser, createComplexForOwner, nextDateForDayOfWeek, configureCourts } from './helpers';

describe('reservations', () => {
  beforeAll(async () => {
    await resetDb();
  });

  it('handles concurrent turn generation for a never-queried range without errors', async () => {
    const { agent: owner } = await registerUser('DUEÑO');
    const complex = await createComplexForOwner(owner);

    await configureCourts(owner, complex, { openTime: '08:00', closeTime: '12:30' });

    const from = '2027-03-01';
    const to = '2027-03-07';

    const responses = await Promise.all(
      Array.from({ length: 8 }).map(() =>
        request(app).get(`/api/complexes/${complex.id}/turns`).query({ from, to })
      )
    );

    expect(responses.every((r) => r.status === 200)).toBe(true);
    const counts = responses.map((r) => r.body.turns.length);
    expect(new Set(counts).size).toBe(1); // every response agrees on the same turn count
    expect(counts[0]).toBeGreaterThan(0);
  });

  it('lets only one of two concurrent bookings on the same turn win, the other gets a clean 409', async () => {
    const { agent: owner } = await registerUser('DUEÑO');
    const complex = await createComplexForOwner(owner);
    const [courtA] = complex.courts;
    const dayOfWeek = 3;

    await configureCourts(owner, complex, { openTime: '18:00', closeTime: '19:30', basePrice: 14000 });

    const targetDate = nextDateForDayOfWeek(dayOfWeek);
    const turnsRes = await request(app)
      .get(`/api/complexes/${complex.id}/turns`)
      .query({ from: targetDate, to: targetDate });
    const turn = turnsRes.body.turns.find((t: any) => t.startTime === '18:00' && t.courtId === courtA.id);
    expect(turn).toBeDefined();

    const body = { guestName: 'Carrera Concurrente', guestPhone: '2911112222' };
    const [r1, r2] = await Promise.all([
      request(app).post(`/api/turns/${turn.id}/reservations`).send(body),
      request(app).post(`/api/turns/${turn.id}/reservations`).send(body),
    ]);

    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([201, 409]);

    const loser = r1.status === 409 ? r1 : r2;
    expect(loser.body.error).toBeTruthy();
    expect(loser.body.state).toBe('OCCUPIED');
  });

  it('frees the turn back to AVAILABLE when a reservation is cancelled', async () => {
    const { agent: owner } = await registerUser('DUEÑO');
    const complex = await createComplexForOwner(owner);
    const [courtA] = complex.courts;
    const dayOfWeek = 4;

    await configureCourts(owner, complex, { openTime: '20:00', closeTime: '21:30', basePrice: 14000 });

    const targetDate = nextDateForDayOfWeek(dayOfWeek);
    const turnsRes = await request(app)
      .get(`/api/complexes/${complex.id}/turns`)
      .query({ from: targetDate, to: targetDate });
    const turn = turnsRes.body.turns.find((t: any) => t.startTime === '20:00' && t.courtId === courtA.id);

    const booking = await request(app)
      .post(`/api/turns/${turn.id}/reservations`)
      .send({ guestName: 'Cancelable', guestPhone: '2913334444' });
    expect(booking.status).toBe(201);
    const reservationId = booking.body.reservation.id;

    // The owner is also allowed to cancel reservations in their own complex.
    const cancel = await owner.delete(`/api/reservations/${reservationId}`);
    expect(cancel.status).toBe(200);

    const turnsAfter = await request(app)
      .get(`/api/complexes/${complex.id}/turns`)
      .query({ from: targetDate, to: targetDate });
    const turnAfter = turnsAfter.body.turns.find((t: any) => t.id === turn.id);
    expect(turnAfter.state).toBe('AVAILABLE');
    expect(turnAfter.reservation).toBeNull();
  });
});
