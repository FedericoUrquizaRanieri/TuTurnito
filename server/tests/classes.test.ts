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

  it('keeps a student payment history after the student is removed, and the pending balance matches recorded payments', async () => {
    const { agent: professor } = await registerUser('PROFESOR');

    const create = await professor.post('/api/professors/students').send({ name: 'Alumno Test', phone: '2917778888' });
    expect(create.status).toBe(201);
    const studentId = create.body.student.id;

    const paid = await professor.post('/api/professors/payments').send({ studentId, amount: 8000, status: 'PAID' });
    expect(paid.status).toBe(201);
    const pending = await professor.post('/api/professors/payments').send({ studentId, amount: 5000, status: 'PENDING' });
    expect(pending.status).toBe(201);

    const studentsBefore = await professor.get('/api/professors/students');
    const studentBefore = studentsBefore.body.students.find((s: any) => s.id === studentId);
    expect(studentBefore.totalPaid).toBe(8000);
    expect(studentBefore.totalPending).toBe(5000);

    const remove = await professor.delete(`/api/professors/students/${studentId}`);
    expect(remove.status).toBe(200);

    const studentsAfter = await professor.get('/api/professors/students');
    expect(studentsAfter.body.students.some((s: any) => s.id === studentId)).toBe(false);

    const payments = await professor.get('/api/professors/payments');
    const studentPayments = payments.body.payments.filter((p: any) => p.payableId === studentId);
    expect(studentPayments.length).toBe(2);
    expect(studentPayments.every((p: any) => p.studentName === 'Alumno Test')).toBe(true);
  });
});
