import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import { app, prisma, resetDb, registerUser, createComplexForOwner, configureCourts, dateFromToday, uniqueEmail } from './helpers';
import { createOwnerAccount } from '../src/services/auth.service';

// Holes found in the security review: each test is an abuse that must fail.

async function ownerWithComplex() {
  const { agent: owner, user: ownerUser } = await registerUser('DUEÑO');
  const complex = await createComplexForOwner(owner);
  await configureCourts(owner, complex);
  return { owner, ownerUser, complex };
}

async function turnAt(complexId: string, date: string, startTime: string): Promise<{ id: string }> {
  const turns = (await request(app).get(`/api/complexes/${complexId}/turns`).query({ from: date, to: date })).body.turns;
  return turns.find((t: any) => t.startTime === startTime);
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

  it('booking needs an account', async () => {
    const { complex } = await ownerWithComplex();
    const turn = await turnAt(complex.id, dateFromToday(2), '18:30');
    const res = await request(app).post(`/api/turns/${turn.id}/reservations`).send({ guestName: 'Bot', guestPhone: '2911234567' });
    expect(res.status).toBe(401);
    expect(await prisma.reservation.count({ where: { turnId: turn.id } })).toBe(0);
  });

  it("a player books with their account's name and phone, whatever the body says", async () => {
    const { complex } = await ownerWithComplex();
    const { agent: player, user } = await registerUser('JUGADOR', { name: 'Ana Real', phone: '2915550000' });
    const turn = await turnAt(complex.id, dateFromToday(2), '18:30');

    const res = await player.post(`/api/turns/${turn.id}/reservations`).send({ guestName: 'Otra Persona', guestPhone: '2919999999', guestEmail: 'otra@test.local' });
    expect(res.status).toBe(201);
    expect(res.body.reservation).toMatchObject({ userId: user.id, guestName: 'Ana Real', guestPhone: '2915550000', guestEmail: user.email });
  });

  it("a player without a phone is asked to add one; the owner books with the client's data", async () => {
    const { owner, complex } = await ownerWithComplex();
    const { agent: player } = await registerUser('JUGADOR');
    await player.put('/api/auth/me').send({ phone: '' });
    const turn = await turnAt(complex.id, dateFromToday(2), '17:00');
    const noPhone = await player.post(`/api/turns/${turn.id}/reservations`).send({});
    expect(noPhone.status).toBe(400);
    expect(noPhone.body.error).toContain('teléfono');

    expect((await owner.post(`/api/turns/${turn.id}/reservations`).send({})).status).toBe(400);
    const forClient = await owner.post(`/api/turns/${turn.id}/reservations`).send({ guestName: 'Cliente', guestPhone: '2913334444' });
    expect(forClient.status).toBe(201);
    expect(forClient.body.reservation).toMatchObject({ userId: null, guestName: 'Cliente', guestPhone: '2913334444' });
  });

  it('a player holds at most 3 future turns per complex and books up to 30 days ahead; the owner has no limit', async () => {
    const { owner, complex } = await ownerWithComplex();
    const other = await ownerWithComplex();
    const { agent: player } = await registerUser('JUGADOR');
    const book = async (agent: any, complexId: string, days: number, time: string) =>
      agent.post(`/api/turns/${(await turnAt(complexId, dateFromToday(days), time)).id}/reservations`).send({ guestName: 'Cliente', guestPhone: '2913334444' });

    for (const days of [1, 2, 3]) expect((await book(player, complex.id, days, '08:00')).status).toBe(201);
    const fourth = await book(player, complex.id, 4, '08:00');
    expect(fourth.status).toBe(409);
    expect(fourth.body.state).toBe('LIMIT');
    // The limit is per complex.
    expect((await book(player, other.complex.id, 4, '08:00')).status).toBe(201);

    // Cancelling one frees a spot.
    const mine = (await player.get('/api/reservations/my')).body.reservations.filter((r: any) => r.complexId === complex.id);
    expect((await player.delete(`/api/reservations/${mine[0].id}`)).status).toBe(200);
    expect((await book(player, complex.id, 4, '08:00')).status).toBe(201);

    const tooFar = await book(player, other.complex.id, 31, '08:00');
    expect(tooFar.status).toBe(409);
    expect(tooFar.body.error).toContain('30 días');
    expect((await book(player, other.complex.id, 30, '09:30')).status).toBe(201);

    for (const days of [5, 6, 7, 40]) expect((await book(owner, complex.id, days, '11:00')).status).toBe(201);
  });

  it('nobody can sign up as an owner; owner accounts are created by hand', async () => {
    const email = uniqueEmail('wannabe');
    const res = await request(app).post('/api/auth/register').send({ name: 'Falso Dueño', email, password: 'test12345', role: 'DUEÑO' });
    expect(res.status).toBe(400);
    expect(await prisma.user.count({ where: { email } })).toBe(0);

    const created = await createOwnerAccount({ email, name: 'Dueño Real', password: 'temporal123' });
    expect(created.role).toBe('DUEÑO');
    const login = await request(app).post('/api/auth/login').send({ email, password: 'temporal123' });
    expect(login.body.user.role).toBe('DUEÑO');
    await expect(createOwnerAccount({ email, name: 'Otra Vez', password: 'x'.repeat(12) })).rejects.toThrow('ya es una cuenta de dueño');

    // An existing player is only turned into an owner when asked explicitly.
    const { user: player } = await registerUser('JUGADOR');
    await expect(createOwnerAccount({ email: player.email, name: 'X', password: 'temporal123' })).rejects.toThrow('--promote');
    const promoted = await createOwnerAccount({ email: player.email, name: 'X', password: 'temporal123', promote: true });
    expect(promoted).toMatchObject({ id: player.id, role: 'DUEÑO' });
  });
  it('with Turnstile on, sign-up and login need a token Cloudflare accepts', async () => {
    process.env.TURNSTILE_SECRET = 'test-secret';
    const verify = vi.spyOn(globalThis, 'fetch');
    try {
      const email = uniqueEmail('captcha');
      const signup = { name: 'Con Captcha', email, password: 'test12345', role: 'JUGADOR' };

      expect((await request(app).post('/api/auth/register').send(signup)).status).toBe(400);
      expect(verify).not.toHaveBeenCalled();

      verify.mockResolvedValueOnce(new Response(JSON.stringify({ success: false })));
      expect((await request(app).post('/api/auth/register').send({ ...signup, 'cf-turnstile-response': 'bad' })).status).toBe(400);
      expect(await prisma.user.count({ where: { email } })).toBe(0);

      verify.mockResolvedValueOnce(new Response(JSON.stringify({ success: true })));
      expect((await request(app).post('/api/auth/register').send({ ...signup, 'cf-turnstile-response': 'good' })).status).toBe(201);
      const [url, init] = verify.mock.calls[1];
      expect(String(url)).toContain('challenges.cloudflare.com');
      expect(String((init as RequestInit).body)).toContain('secret=test-secret');

      expect((await request(app).post('/api/auth/login').send({ email, password: 'test12345' })).status).toBe(400);
      verify.mockResolvedValueOnce(new Response(JSON.stringify({ success: true })));
      expect((await request(app).post('/api/auth/login').send({ email, password: 'test12345', 'cf-turnstile-response': 'good' })).status).toBe(200);
    } finally {
      delete process.env.TURNSTILE_SECRET;
      verify.mockRestore();
    }
  });
});
