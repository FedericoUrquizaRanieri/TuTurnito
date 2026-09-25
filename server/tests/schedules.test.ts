import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app, resetDb, registerUser, createComplexForOwner, nextDateForDayOfWeek } from './helpers';

describe('schedules', () => {
  beforeAll(async () => {
    await resetDb();
  });

  it('saves a valid weekly grid and the read-back matches what was sent', async () => {
    const { agent: owner } = await registerUser('DUEÑO');
    const complex = await createComplexForOwner(owner);
    const [courtA, courtB] = complex.courts;

    const cells = [
      { courtId: courtA.id, dayOfWeek: 1, startTime: '09:00', endTime: '10:30', price: 15000, availability: 'AVAILABLE' },
      { courtId: courtB.id, dayOfWeek: 1, startTime: '09:00', endTime: '10:30', price: 16000, availability: 'AVAILABLE' },
    ];

    const save = await owner.put(`/api/complexes/${complex.id}/schedule`).send({ cells });
    expect(save.status).toBe(200);

    const grid = await owner.get(`/api/complexes/${complex.id}/schedule`);
    expect(grid.status).toBe(200);
    const allCells = grid.body.courts.flatMap((c: any) => c.templateCells);
    expect(allCells.length).toBe(2);
    expect(allCells.some((c: any) => c.price === 15000)).toBe(true);
    expect(allCells.some((c: any) => c.price === 16000)).toBe(true);
  });

  it('rejects a malformed cell with 400 instead of saving it', async () => {
    const { agent: owner } = await registerUser('DUEÑO');
    const complex = await createComplexForOwner(owner);
    const [courtA] = complex.courts;

    const res = await owner.put(`/api/complexes/${complex.id}/schedule`).send({
      cells: [{ courtId: courtA.id, dayOfWeek: 1, startTime: '9:00', endTime: '10:30', price: 1000, availability: 'AVAILABLE' }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();

    const grid = await owner.get(`/api/complexes/${complex.id}/schedule`);
    const allCells = grid.body.courts.flatMap((c: any) => c.templateCells);
    expect(allCells.length).toBe(0);
  });

  it('rejects blocking a cell with a future reservation until resolveConflicts is given, then applies it correctly', async () => {
    const { agent: owner } = await registerUser('DUEÑO');
    const complex = await createComplexForOwner(owner);
    const [courtA] = complex.courts;
    const dayOfWeek = 2;
    const startTime = '11:00';

    await owner.put(`/api/complexes/${complex.id}/schedule`).send({
      cells: [{ courtId: courtA.id, dayOfWeek, startTime, endTime: '12:30', price: 12000, availability: 'AVAILABLE' }],
    });

    const targetDate = nextDateForDayOfWeek(dayOfWeek);
    const turnsRes = await request(app)
      .get(`/api/complexes/${complex.id}/turns`)
      .query({ from: targetDate, to: targetDate });
    const turn = turnsRes.body.turns.find((t: any) => t.startTime === startTime && t.courtId === courtA.id);
    expect(turn).toBeDefined();

    const booking = await request(app)
      .post(`/api/turns/${turn.id}/reservations`)
      .send({ guestName: 'Test Guest', guestPhone: '2911234567' });
    expect(booking.status).toBe(201);

    // Attempt to block without resolving conflicts: rejected, nothing changed.
    const blockAttempt = await owner.put(`/api/complexes/${complex.id}/schedule`).send({
      cells: [{ courtId: courtA.id, dayOfWeek, startTime, endTime: '12:30', price: 12000, availability: 'BLOCKED' }],
    });
    expect(blockAttempt.status).toBe(409);
    expect(blockAttempt.body.hasConflicts).toBe(true);
    expect(blockAttempt.body.conflictType).toBe('CELL_BLOCKED');
    expect(blockAttempt.body.conflicts[0].reservationId).toBeDefined();

    // Resolve by cancelling the conflicting reservation.
    const blockResolved = await owner.put(`/api/complexes/${complex.id}/schedule`).send({
      cells: [{ courtId: courtA.id, dayOfWeek, startTime, endTime: '12:30', price: 12000, availability: 'BLOCKED' }],
      resolveConflicts: 'CANCEL',
    });
    expect(blockResolved.status).toBe(200);

    const turnsAfter = await request(app)
      .get(`/api/complexes/${complex.id}/turns`)
      .query({ from: targetDate, to: targetDate });
    const turnAfter = turnsAfter.body.turns.find((t: any) => t.id === turn.id);
    expect(turnAfter.state).toBe('BLOCKED');
    expect(turnAfter.reservation).toBeNull();
  });
});
