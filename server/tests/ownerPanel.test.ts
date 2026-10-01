import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import {
  app,
  prisma,
  resetDb,
  registerUser,
  createComplexForOwner,
  nextDateForDayOfWeek,
  configureCourts,
  dateFromToday,
} from './helpers';
import { parseDateString } from '../src/services/schedule.service';

async function getTurn(complexId: string, date: string, courtId: string, startTime: string): Promise<any> {
  // The public endpoint generates the turns but only says whether they're taken;
  // who booked them is read straight from the database.
  const res = await request(app).get(`/api/complexes/${complexId}/turns`).query({ from: date, to: date });
  const found = res.body.turns?.find((t: any) => t.courtId === courtId && t.startTime === startTime);
  return found ? prisma.turn.findUnique({ where: { id: found.id }, include: { reservation: true } }) : undefined;
}

describe('owner reservations panel', () => {
  beforeAll(async () => {
    await resetDb();
  });

  it('lets the owner block, mark as tournament and free a turn; tournaments cannot be booked', async () => {
    const { agent: owner } = await registerUser('DUEÑO');
    const complex = await createComplexForOwner(owner);
    const [courtA] = complex.courts;
    await configureCourts(owner, complex);

    const date = nextDateForDayOfWeek(5);
    const turn = await getTurn(complex.id, date, courtA.id, '18:30');

    const block = await owner.patch(`/api/complexes/${complex.id}/turns/${turn.id}`).send({ state: 'BLOCKED' });
    expect(block.status).toBe(200);
    expect(block.body.turn.state).toBe('BLOCKED');

    const tournament = await owner
      .patch(`/api/complexes/${complex.id}/turns/${turn.id}`)
      .send({ state: 'TOURNAMENT', label: 'Torneo de Primavera', price: 20000 });
    expect(tournament.status).toBe(200);
    expect(tournament.body.turn).toMatchObject({ state: 'TOURNAMENT', label: 'Torneo de Primavera', price: 20000 });

    const { agent: player } = await registerUser('JUGADOR');
    const booking = await player.post(`/api/turns/${turn.id}/reservations`).send({});
    expect(booking.status).toBe(409);

    // The manual edit survives a re-sync of the courts.
    await configureCourts(owner, complex, { basePrice: 13000 });
    const afterSync = await getTurn(complex.id, date, courtA.id, '18:30');
    expect(afterSync).toMatchObject({ state: 'TOURNAMENT', price: 20000 });

    const free = await owner.patch(`/api/complexes/${complex.id}/turns/${turn.id}`).send({ state: 'AVAILABLE' });
    expect(free.status).toBe(200);
    expect(free.body.turn).toMatchObject({ state: 'AVAILABLE', label: null });
  });

  it('refuses to edit an occupied turn and turns of another complex', async () => {
    const { agent: owner } = await registerUser('DUEÑO');
    const complex = await createComplexForOwner(owner);
    const [courtA] = complex.courts;
    await configureCourts(owner, complex);

    const date = nextDateForDayOfWeek(6);
    const turn = await getTurn(complex.id, date, courtA.id, '11:00');
    await owner.post(`/api/turns/${turn.id}/reservations`).send({ guestName: 'Ocupado', guestPhone: '2911234567' });

    const res = await owner.patch(`/api/complexes/${complex.id}/turns/${turn.id}`).send({ state: 'BLOCKED' });
    expect(res.status).toBe(409);

    const { agent: otherOwner } = await registerUser('DUEÑO');
    const otherComplex = await createComplexForOwner(otherOwner);
    const foreign = await otherOwner.patch(`/api/complexes/${otherComplex.id}/turns/${turn.id}`).send({ state: 'BLOCKED' });
    expect(foreign.status).toBe(404);
  });

  it('books a manual reservation on behalf of the client, not the owner account', async () => {
    const { agent: owner } = await registerUser('DUEÑO');
    const complex = await createComplexForOwner(owner);
    const [courtA] = complex.courts;
    await configureCourts(owner, complex);

    const turn = await getTurn(complex.id, nextDateForDayOfWeek(1), courtA.id, '09:30');
    const booking = await owner
      .post(`/api/turns/${turn.id}/reservations`)
      .send({ guestName: 'Cliente Telefónico', guestPhone: '2915556666' });
    expect(booking.status).toBe(201);
    expect(booking.body.reservation.userId).toBeNull();
  });

  it('turns a fixed booking into weekly reservations with a pending payment', async () => {
    const { agent: owner } = await registerUser('DUEÑO');
    const complex = await createComplexForOwner(owner);
    const [courtA] = complex.courts;
    await configureCourts(owner, complex);

    const dayOfWeek = parseDateString(dateFromToday(2)).dayOfWeek;
    const firstDate = dateFromToday(2);
    const secondDate = dateFromToday(9);

    // Somebody already booked the second week's slot: that date is reported as skipped.
    const taken = await getTurn(complex.id, secondDate, courtA.id, '20:00');
    await owner.post(`/api/turns/${taken.id}/reservations`).send({ guestName: 'Llegó Antes', guestPhone: '2911234567' });

    const create = await owner.post(`/api/complexes/${complex.id}/fixed-bookings`).send({
      courtId: courtA.id,
      dayOfWeek,
      startTime: '20:00',
      guestName: 'Los Fijos',
      guestPhone: '2917778888',
    });
    expect(create.status).toBe(201);
    expect(create.body.skippedDates).toEqual([secondDate]);

    const first = await getTurn(complex.id, firstDate, courtA.id, '20:00');
    expect(first.state).toBe('OCCUPIED');
    expect(first.reservation.guestName).toBe('Los Fijos');
    expect(first.reservation.fixedBookingId).toBe(create.body.fixedBooking.id);

    const payment = await prisma.payment.findFirst({ where: { payableId: first.reservation.id } });
    expect(payment?.status).toBe('PENDING');

    // Later weeks get booked as soon as their turns are generated.
    const later = await getTurn(complex.id, dateFromToday(16), courtA.id, '20:00');
    expect(later.reservation?.guestName).toBe('Los Fijos');

    // A slot that doesn't exist in the court's range is rejected.
    const bad = await owner.post(`/api/complexes/${complex.id}/fixed-bookings`).send({
      courtId: courtA.id, dayOfWeek, startTime: '20:15', guestName: 'Mal Horario', guestPhone: '2917778888',
    });
    expect(bad.status).toBe(400);
  });

  it('does not regenerate a cancelled fixed occurrence, and deleting with cancelFuture frees the rest', async () => {
    const { agent: owner } = await registerUser('DUEÑO');
    const complex = await createComplexForOwner(owner);
    const [courtA] = complex.courts;
    await configureCourts(owner, complex);

    const date = dateFromToday(3);
    const dayOfWeek = parseDateString(date).dayOfWeek;
    const create = await owner.post(`/api/complexes/${complex.id}/fixed-bookings`).send({
      courtId: courtA.id, dayOfWeek, startTime: '17:00', guestName: 'Fijo Cancelable', guestPhone: '2917778888',
    });
    const fixedId = create.body.fixedBooking.id;

    const occurrence = await getTurn(complex.id, date, courtA.id, '17:00');
    const cancel = await owner.delete(`/api/reservations/${occurrence.reservation.id}`);
    expect(cancel.status).toBe(200);

    const afterCancel = await getTurn(complex.id, date, courtA.id, '17:00');
    expect(afterCancel.state).toBe('AVAILABLE');
    expect(afterCancel.reservation).toBeNull();

    const nextWeek = await getTurn(complex.id, dateFromToday(10), courtA.id, '17:00');
    expect(nextWeek.reservation?.fixedBookingId).toBe(fixedId);

    const remove = await owner.delete(`/api/complexes/${complex.id}/fixed-bookings/${fixedId}?cancelFuture=true`);
    expect(remove.status).toBe(200);

    const freed = await getTurn(complex.id, dateFromToday(10), courtA.id, '17:00');
    expect(freed.state).toBe('AVAILABLE');
    const list = await owner.get(`/api/complexes/${complex.id}/fixed-bookings`);
    expect(list.body.fixedBookings).toHaveLength(0);
  });

  it('returns the owner grid with payment info and filters the reservation stats by date range', async () => {
    const { agent: owner } = await registerUser('DUEÑO');
    const complex = await createComplexForOwner(owner);
    const [courtA] = complex.courts;
    await configureCourts(owner, complex, { basePrice: 10000 });

    const near = await getTurn(complex.id, dateFromToday(1), courtA.id, '08:00');
    const far = await getTurn(complex.id, dateFromToday(12), courtA.id, '08:00');
    const nearRes = await owner.post(`/api/turns/${near.id}/reservations`).send({ guestName: 'Cerca', guestPhone: '2911234567' });
    await owner.post(`/api/turns/${far.id}/reservations`).send({ guestName: 'Lejos', guestPhone: '2911234567' });
    await owner.put(`/api/reservations/${nearRes.body.reservation.id}/payment`).send({ status: 'PAID' });

    const grid = await owner
      .get(`/api/complexes/${complex.id}/owner-turns`)
      .query({ from: dateFromToday(-7), to: dateFromToday(13) });
    expect(grid.status).toBe(200);
    expect(grid.body.courts).toHaveLength(2);
    const nearInGrid = grid.body.turns.find((t: any) => t.id === near.id);
    expect(nearInGrid.reservation).toMatchObject({ guestName: 'Cerca', paymentStatus: 'PAID', paymentAmount: 10000 });

    const stats = await owner
      .get(`/api/complexes/${complex.id}/reservations`)
      .query({ from: dateFromToday(0), to: dateFromToday(6) });
    expect(stats.status).toBe(200);
    expect(stats.body.stats).toEqual({ totalReservations: 1, totalCollected: 10000, totalPending: 0 });

    // Only the owner can read the grid.
    const { agent: player } = await registerUser('JUGADOR');
    const denied = await player.get(`/api/complexes/${complex.id}/owner-turns`).query({ from: dateFromToday(0), to: dateFromToday(1) });
    expect(denied.status).toBe(403);
  });
});
