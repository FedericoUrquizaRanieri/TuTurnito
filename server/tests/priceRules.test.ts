import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app, prisma, resetDb, registerUser, createComplexForOwner, configureCourts, dateFromToday } from './helpers';
import { parseDateString } from '../src/services/schedule.service';

async function ownerWithComplex() {
  const { agent: owner } = await registerUser('DUEÑO');
  const complex = await createComplexForOwner(owner);
  await configureCourts(owner, complex, { openTime: '08:00', closeTime: '23:00', slotMinutes: 60, basePrice: 10000 });
  return { owner, complex, court: complex.courts[0], courtB: complex.courts[1] };
}

async function turnAt(complexId: string, date: string, courtId: string, startTime: string) {
  const res = await request(app).get(`/api/complexes/${complexId}/turns`).query({ from: date, to: date });
  return res.body.turns.find((t: any) => t.courtId === courtId && t.startTime === startTime);
}

describe('price rules (precios por franja)', () => {
  beforeAll(async () => {
    await resetDb();
  });

  it('prices turns by weekday and time slot, with a court rule winning over an all-courts rule', async () => {
    const { owner, complex, court, courtB } = await ownerWithComplex();
    const day = dateFromToday(3);
    const dow = parseDateString(day).dayOfWeek;
    const otherDow = (dow + 1) % 7;

    const res = await owner.put(`/api/complexes/${complex.id}/price-rules`).send({
      rules: [
        { courtId: null, daysOfWeek: [dow], startTime: '18:00', endTime: '23:00', price: 15000, label: 'Hora pico' },
        { courtId: courtB.id, daysOfWeek: [dow], startTime: '18:00', endTime: '20:00', price: 18000 },
        { courtId: null, daysOfWeek: [otherDow], startTime: '08:00', endTime: '12:00', price: 7000 },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.rules).toHaveLength(3);

    expect((await turnAt(complex.id, day, court.id, '10:00')).price).toBe(10000);
    expect((await turnAt(complex.id, day, court.id, '18:00')).price).toBe(15000);
    expect((await turnAt(complex.id, day, court.id, '22:00')).price).toBe(15000);
    expect((await turnAt(complex.id, day, courtB.id, '19:00')).price).toBe(18000);
    expect((await turnAt(complex.id, day, courtB.id, '20:00')).price).toBe(15000);
    expect((await turnAt(complex.id, dateFromToday(4), court.id, '09:00')).price).toBe(7000);
  });

  it('rejects overlapping rules for the same target', async () => {
    const { owner, complex } = await ownerWithComplex();
    const res = await owner.put(`/api/complexes/${complex.id}/price-rules`).send({
      rules: [
        { courtId: null, daysOfWeek: [1, 2], startTime: '18:00', endTime: '22:00', price: 15000 },
        { courtId: null, daysOfWeek: [2], startTime: '21:00', endTime: '23:00', price: 16000 },
      ],
    });
    expect(res.status).toBe(400);
    expect(await prisma.priceRule.count({ where: { complexId: complex.id } })).toBe(0);
  });

  it('keeps the price of booked turns and books new ones at the rule price', async () => {
    const { owner, complex, court } = await ownerWithComplex();
    const day = dateFromToday(2);
    const dow = parseDateString(day).dayOfWeek;
    const booked = await turnAt(complex.id, day, court.id, '19:00');
    expect((await owner.post(`/api/turns/${booked.id}/reservations`).send({ guestName: 'Ana', guestPhone: '2911234567' })).status).toBe(201);

    await owner.put(`/api/complexes/${complex.id}/price-rules`).send({
      rules: [{ courtId: null, daysOfWeek: [dow], startTime: '18:00', endTime: '23:00', price: 15000 }],
    });

    expect((await prisma.turn.findUnique({ where: { id: booked.id } }))?.price).toBe(10000);
    const free = await turnAt(complex.id, day, court.id, '20:00');
    expect(free.price).toBe(15000);
    const res = await owner.post(`/api/turns/${free.id}/reservations`).send({ guestName: 'Beto', guestPhone: '2911234567' });
    expect(res.body.payment.amount).toBe(15000);
  });

  it('a turn at its rule price is not flagged as a manual override, a custom one is', async () => {
    const { owner, complex, court } = await ownerWithComplex();
    const day = dateFromToday(5);
    const dow = parseDateString(day).dayOfWeek;
    await owner.put(`/api/complexes/${complex.id}/price-rules`).send({
      rules: [{ courtId: null, daysOfWeek: [dow], startTime: '18:00', endTime: '23:00', price: 15000 }],
    });
    const turn = await turnAt(complex.id, day, court.id, '18:00');

    const same = await owner.patch(`/api/complexes/${complex.id}/turns/${turn.id}`).send({ price: 15000 });
    expect(same.status).toBe(200);
    expect(same.body.turn.manualOverride).toBe(false);

    const custom = await owner.patch(`/api/complexes/${complex.id}/turns/${turn.id}`).send({ price: 9000 });
    expect(custom.body.turn.manualOverride).toBe(true);

    // Removing the rules doesn't touch the custom-priced turn.
    await owner.put(`/api/complexes/${complex.id}/price-rules`).send({ rules: [] });
    expect((await prisma.turn.findUnique({ where: { id: turn.id } }))?.price).toBe(9000);
  });
});
