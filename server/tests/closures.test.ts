import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app, prisma, resetDb, registerUser, createComplexForOwner, configureCourts, dateFromToday } from './helpers';
import { parseDateString } from '../src/services/schedule.service';

const GUEST = { guestName: 'Invitado', guestPhone: '2911234567' };

async function ownerWithComplex() {
  const { agent: owner } = await registerUser('DUEÑO');
  const complex = await createComplexForOwner(owner);
  await configureCourts(owner, complex, { openTime: '08:00', closeTime: '23:00', slotMinutes: 60, basePrice: 10000 });
  return { owner, complex, court: complex.courts[0] };
}

async function turnsOn(complexId: string, date: string) {
  const res = await request(app).get(`/api/complexes/${complexId}/turns`).query({ from: date, to: date });
  return res.body.turns as any[];
}

describe('closures (holidays)', () => {
  beforeAll(async () => {
    await resetDb();
  });

  it('blocks every court on the closed days, including days whose turns were not generated yet', async () => {
    const { owner, complex } = await ownerWithComplex();
    const far = dateFromToday(80); // beyond the 60-day sync window

    const res = await owner.post(`/api/complexes/${complex.id}/closures`).send({ startDate: far, endDate: far, reason: 'Feriado' });
    expect(res.status).toBe(201);

    const turns = await turnsOn(complex.id, far);
    expect(turns.length).toBeGreaterThan(0);
    expect(turns.every((t) => t.state === 'BLOCKED' && t.label === 'Feriado')).toBe(true);

    const list = await owner.get(`/api/complexes/${complex.id}/closures`);
    expect(list.body.closures).toHaveLength(1);
  });

  it('returns the affected reservations as a 409 and cancels them only when confirmed', async () => {
    const { owner, complex, court } = await ownerWithComplex();
    const day = dateFromToday(5);
    const turn = (await turnsOn(complex.id, day)).find((t) => t.courtId === court.id && t.startTime === '18:00');
    expect((await owner.post(`/api/turns/${turn.id}/reservations`).send(GUEST)).status).toBe(201);

    const conflict = await owner.post(`/api/complexes/${complex.id}/closures`).send({ startDate: day, endDate: day, reason: 'Lluvia' });
    expect(conflict.status).toBe(409);
    expect(conflict.body.conflicts).toHaveLength(1);
    expect(await prisma.closure.count({ where: { complexId: complex.id } })).toBe(0);

    const ok = await owner
      .post(`/api/complexes/${complex.id}/closures`)
      .send({ startDate: day, endDate: day, reason: 'Lluvia', cancelConflicts: true });
    expect(ok.status).toBe(201);
    expect(ok.body.cancelled).toBe(1);
    const after = await prisma.turn.findUnique({ where: { id: turn.id }, include: { reservation: true } });
    expect(after?.state).toBe('BLOCKED');
    expect(after?.reservation).toBeNull();
  });

  it('keeps fixed bookings off closed days and brings them back when the closure is deleted', async () => {
    const { owner, complex, court } = await ownerWithComplex();
    const day = dateFromToday(20); // outside the fixed booking's immediate materialization window
    const closure = await owner.post(`/api/complexes/${complex.id}/closures`).send({ startDate: day, endDate: day, reason: 'Feriado' });
    expect(closure.status).toBe(201);

    const fb = await owner.post(`/api/complexes/${complex.id}/fixed-bookings`).send({
      courtId: court.id, dayOfWeek: parseDateString(day).dayOfWeek, startTime: '20:00', guestName: 'Fijo', guestPhone: '2915555555',
    });
    expect(fb.status).toBe(201);

    let slot = (await turnsOn(complex.id, day)).find((t) => t.courtId === court.id && t.startTime === '20:00');
    expect(slot.state).toBe('BLOCKED');

    expect((await owner.delete(`/api/complexes/${complex.id}/closures/${closure.body.closure.id}`)).status).toBe(200);
    slot = (await turnsOn(complex.id, day)).find((t) => t.courtId === court.id && t.startTime === '20:00');
    expect(slot.state).toBe('OCCUPIED');
    const other = (await turnsOn(complex.id, day)).find((t) => t.courtId === court.id && t.startTime === '10:00');
    expect(other.state).toBe('AVAILABLE');
    expect(other.label).toBeNull();
  });

  it('does not book a professor class on a closed day, so students are not charged for it', async () => {
    const { owner, complex, court } = await ownerWithComplex();
    const { agent: professor } = await registerUser('PROFESOR');
    const joinReq = await professor.post('/api/professors/requests').send({ complexId: complex.id });
    await owner.put(`/api/professors/complexes/${complex.id}/professor-requests/${joinReq.body.request.id}`).send({ status: 'APPROVED' });

    const day = dateFromToday(3);
    await owner.post(`/api/complexes/${complex.id}/closures`).send({ startDate: day, endDate: day, reason: 'Feriado' });
    const sched = await professor.post('/api/professors/class-schedules').send({
      complexId: complex.id, courtId: court.id, daysOfWeek: [parseDateString(day).dayOfWeek], startTime: '18:00', endTime: '19:00',
    });
    expect(sched.status).toBe(201);

    const slot = (await turnsOn(complex.id, day)).find((t) => t.courtId === court.id && t.startTime === '18:00');
    expect(slot.state).toBe('BLOCKED');
    expect(await prisma.reservation.count({ where: { classScheduleId: sched.body.schedule.id, turn: { date: day } } })).toBe(0);
  });

  it('rejects past closures and editing a turn blocked by a closure', async () => {
    const { owner, complex } = await ownerWithComplex();
    const past = await owner.post(`/api/complexes/${complex.id}/closures`).send({ startDate: dateFromToday(-1), endDate: dateFromToday(1), reason: 'X' + 'x' });
    expect(past.status).toBe(400);

    const day = dateFromToday(4);
    await owner.post(`/api/complexes/${complex.id}/closures`).send({ startDate: day, endDate: day, reason: 'Feriado' });
    const turn = (await turnsOn(complex.id, day))[0];
    const edit = await owner.patch(`/api/complexes/${complex.id}/turns/${turn.id}`).send({ state: 'AVAILABLE' });
    expect(edit.status).toBe(409);
  });
});
