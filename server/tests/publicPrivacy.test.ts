import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app, resetDb, registerUser, createComplexForOwner, configureCourts, dateFromToday } from './helpers';

// Endpoints anyone can call without logging in must not leak who booked a
// turn or the owner's personal contact.

describe('public endpoints privacy', () => {
  beforeAll(async () => {
    await resetDb();
  });

  it('public turns only tell whether a turn is taken (and if it is a class), never who booked it', async () => {
    const { agent: owner } = await registerUser('DUEÑO', { phone: '2910000001' });
    const complex = await createComplexForOwner(owner);
    await configureCourts(owner, complex, { openTime: '18:00', closeTime: '20:00', slotMinutes: 60, basePrice: 10000 });
    const { agent: player, user } = await registerUser('JUGADOR', { phone: '2919999999' });
    const date = dateFromToday(2);

    const before = await request(app).get(`/api/complexes/${complex.id}/turns`).query({ from: date, to: date });
    const turn = before.body.turns[0];
    const booking = await player
      .post(`/api/turns/${turn.id}/reservations`)
      .send({ guestName: 'Jugadora Privada', guestPhone: '2911112222', guestEmail: 'privada@test.local', notes: 'nota privada' });
    expect(booking.status).toBe(201);

    const res = await request(app).get(`/api/complexes/${complex.id}/turns`).query({ from: date, to: date });
    const booked = res.body.turns.find((t: any) => t.id === turn.id);
    expect(booked.state).toBe('OCCUPIED');
    expect(booked.reservation).toEqual({ type: 'PLAYER' });
    expect(Object.keys(booked).sort()).toEqual(['court', 'courtId', 'date', 'endTime', 'id', 'label', 'price', 'reservation', 'startTime', 'state']);

    const body = JSON.stringify(res.body);
    for (const secret of ['Jugadora Privada', '2911112222', 'privada@test.local', 'nota privada', user.email, '2919999999']) {
      expect(body).not.toContain(secret);
    }
  });

  it("public complex endpoints don't expose the owner's email or personal phone", async () => {
    const { agent: owner, user: ownerUser } = await registerUser('DUEÑO', { phone: '2910000002' });
    const complex = await createComplexForOwner(owner);

    const detail = await request(app).get(`/api/complexes/${complex.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.complex.owner).toEqual({ id: ownerUser.id, name: ownerUser.name });

    const catalog = await request(app).get('/api/complexes');
    const body = JSON.stringify(catalog.body) + JSON.stringify(detail.body);
    expect(body).not.toContain(ownerUser.email);
    expect(body).not.toContain('2910000002');
  });
});
