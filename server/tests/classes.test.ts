import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app, resetDb, registerUser, createComplexForOwner, nextDateForDayOfWeek, configureCourts } from './helpers';

describe('classes', () => {
  beforeAll(async () => {
    await resetDb();
  });

  it('blocks a CLASS reservation from a professor with no approved link, then allows it once approved', async () => {
    const { agent: owner } = await registerUser('DUEÑO');
    const complex = await createComplexForOwner(owner);
    const [courtA] = complex.courts;
    const dayOfWeek = 5;

    await configureCourts(owner, complex, { openTime: '10:00', closeTime: '11:00', slotMinutes: 60, basePrice: 10000 });

    const targetDate = nextDateForDayOfWeek(dayOfWeek);
    const turnsRes = await request(app)
      .get(`/api/complexes/${complex.id}/turns`)
      .query({ from: targetDate, to: targetDate });
    const turn = turnsRes.body.turns.find((t: any) => t.startTime === '10:00' && t.courtId === courtA.id);

    const { agent: professor } = await registerUser('PROFESOR');

    const blocked = await professor
      .post(`/api/turns/${turn.id}/reservations`)
      .send({ guestName: 'Clase sin vínculo', guestPhone: '2915556666', type: 'CLASS' });
    expect(blocked.status).toBe(403);

    const joinReq = await professor.post('/api/professors/requests').send({ complexId: complex.id });
    expect(joinReq.status).toBe(201);

    const approve = await owner
      .put(`/api/professors/complexes/${complex.id}/professor-requests/${joinReq.body.request.id}`)
      .send({ status: 'APPROVED' });
    expect(approve.status).toBe(200);

    const allowed = await professor
      .post(`/api/turns/${turn.id}/reservations`)
      .send({ guestName: 'Clase con vínculo', guestPhone: '2915556666', type: 'CLASS' });
    expect(allowed.status).toBe(201);
    expect(allowed.body.reservation.type).toBe('CLASS');
  });
});
