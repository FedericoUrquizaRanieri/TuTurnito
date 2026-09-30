import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app, prisma, resetDb, registerUser, createComplexForOwner, configureCourts, dateFromToday, uniqueEmail } from './helpers';

// Holes found in the security review: each test is an abuse that must fail.

async function ownerWithComplex() {
  const { agent: owner, user: ownerUser } = await registerUser('DUEÑO');
  const complex = await createComplexForOwner(owner);
  await configureCourts(owner, complex);
  return { owner, ownerUser, complex };
}

describe('security', () => {
  beforeAll(async () => {
    await resetDb();
  });

  it("an owner can't approve a professor's request aimed at another owner's complex", async () => {
    const a = await ownerWithComplex();
    const b = await ownerWithComplex();
    const { agent: professor, user: professorUser } = await registerUser('PROFESOR');
    const joinReq = await professor.post('/api/professors/requests').send({ complexId: b.complex.id });
    expect(joinReq.status).toBe(201);

    // Owner A passes the ownership check with their own complex id in the URL.
    const res = await a.owner
      .put(`/api/professors/complexes/${a.complex.id}/professor-requests/${joinReq.body.request.id}`)
      .send({ status: 'APPROVED' });
    expect(res.status).toBe(404);

    const link = await prisma.professorComplex.findUnique({
      where: { professorId_complexId: { professorId: professorUser.id, complexId: b.complex.id } },
    });
    expect(link).toBeNull();
    expect((await prisma.professorRequest.findUniqueOrThrow({ where: { id: joinReq.body.request.id } })).status).toBe('PENDING');
  });

  it('changing the email or the password asks for the current password', async () => {
    const { agent, user } = await registerUser('JUGADOR', { password: 'original123' });
    const newEmail = uniqueEmail('moved');

    expect((await agent.put('/api/auth/me').send({ email: newEmail })).status).toBe(403);
    expect((await agent.put('/api/auth/me').send({ email: newEmail, currentPassword: 'wrong-pass' })).status).toBe(403);
    expect((await agent.put('/api/auth/me').send({ newPassword: 'nueva12345' })).status).toBe(403);

    // Sending the same email back (the profile form always does) needs no password.
    expect((await agent.put('/api/auth/me').send({ email: user.email, name: 'Otro Nombre' })).status).toBe(200);

    const moved = await agent.put('/api/auth/me').send({ email: newEmail, newPassword: 'nueva12345', currentPassword: 'original123' });
    expect(moved.status).toBe(200);
    expect(moved.body.user.email).toBe(newEmail);

    expect((await request(app).post('/api/auth/login').send({ email: newEmail, password: 'original123' })).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ email: newEmail, password: 'nueva12345' })).status).toBe(200);
    // The reissued session carries the new email.
    expect((await agent.get('/api/auth/me')).body.user.email).toBe(newEmail);
  });

  it('the public turns listing only covers a window around today', async () => {
    const { complex } = await ownerWithComplex();
    const turns = (from: string, to: string) => request(app).get(`/api/complexes/${complex.id}/turns`).query({ from, to });

    expect((await turns(dateFromToday(-7), dateFromToday(-7))).status).toBe(200);
    expect((await turns(dateFromToday(90), dateFromToday(90))).status).toBe(200);
    expect((await turns(dateFromToday(-8), dateFromToday(-8))).status).toBe(400);
    expect((await turns(dateFromToday(91), dateFromToday(91))).status).toBe(400);
    expect((await turns('2099-01-01', '2099-01-01')).status).toBe(400);
  });
});
