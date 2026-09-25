import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app, resetDb, registerUser, createComplexForOwner, nextDateForDayOfWeek } from './helpers';

describe('reservations', () => {
  beforeAll(async () => {
    await resetDb();
  });

  it('handles concurrent turn generation for a never-queried range without errors', async () => {
    const { agent: owner } = await registerUser('DUEÑO');
    const complex = await createComplexForOwner(owner);
    const [courtA] = complex.courts;

    // Give every day of the week a template cell so any date range has turns to materialize.
    const cells = Array.from({ length: 7 }).map((_, dayOfWeek) => ({
      courtId: courtA.id,
      dayOfWeek,
      startTime: '08:00',
      endTime: '09:30',
      price: 12000,
      availability: 'AVAILABLE' as const,
    }));
    await owner.put(`/api/complexes/${complex.id}/schedule`).send({ cells });

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

    await owner.put(`/api/complexes/${complex.id}/schedule`).send({
      cells: [{ courtId: courtA.id, dayOfWeek, startTime: '18:00', endTime: '19:30', price: 14000, availability: 'AVAILABLE' }],
    });

    const targetDate = nextDateForDayOfWeek(dayOfWeek);
    const turnsRes = await request(app)
      .get(`/api/complexes/${complex.id}/turns`)
      .query({ from: targetDate, to: targetDate });
    const turn = turnsRes.body.turns.find((t: any) => t.startTime === '18:00');
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

    await owner.put(`/api/complexes/${complex.id}/schedule`).send({
      cells: [{ courtId: courtA.id, dayOfWeek, startTime: '20:00', endTime: '21:30', price: 14000, availability: 'AVAILABLE' }],
    });

    const targetDate = nextDateForDayOfWeek(dayOfWeek);
    const turnsRes = await request(app)
      .get(`/api/complexes/${complex.id}/turns`)
      .query({ from: targetDate, to: targetDate });
    const turn = turnsRes.body.turns.find((t: any) => t.startTime === '20:00');

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
