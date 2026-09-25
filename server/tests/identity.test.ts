import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app, prisma, resetDb, registerUser, uniqueEmail } from './helpers';

describe('identity', () => {
  beforeAll(async () => {
    await resetDb();
  });

  it('registers a new user and never returns or stores the raw password', async () => {
    const email = uniqueEmail('player');
    const res = await request(app).post('/api/auth/register').send({
      name: 'Jugador Test',
      email,
      password: 'secreto123',
      role: 'JUGADOR',
    });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(email);
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(res.body.user).not.toHaveProperty('password');

    const dbUser = await prisma.user.findUnique({ where: { email } });
    expect(dbUser?.passwordHash).toBeTruthy();
    expect(dbUser?.passwordHash).not.toBe('secreto123');
  });

  it('rejects registering the same email twice with 409', async () => {
    const email = uniqueEmail('dup');
    const payload = { name: 'Dup', email, password: 'secreto123', role: 'JUGADOR' };

    const first = await request(app).post('/api/auth/register').send(payload);
    expect(first.status).toBe(201);

    const second = await request(app).post('/api/auth/register').send(payload);
    expect(second.status).toBe(409);
  });

  it('logs in, reads /me, and logs out', async () => {
    const email = uniqueEmail('flow');
    const password = 'secreto123';
    await request(app).post('/api/auth/register').send({ name: 'Flow', email, password, role: 'JUGADOR' });

    const agent = request.agent(app);
    const login = await agent.post('/api/auth/login').send({ email, password });
    expect(login.status).toBe(200);

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(email);

    const logout = await agent.post('/api/auth/logout');
    expect(logout.status).toBe(200);

    const meAfterLogout = await agent.get('/api/auth/me');
    expect(meAfterLogout.status).toBe(401);
  });

  it('rejects a wrong password with 401', async () => {
    const email = uniqueEmail('wrongpass');
    await request(app).post('/api/auth/register').send({ name: 'WP', email, password: 'correct123', role: 'JUGADOR' });

    const res = await request(app).post('/api/auth/login').send({ email, password: 'incorrect' });
    expect(res.status).toBe(401);
  });

  it('requireRole blocks a JUGADOR from an owner-only endpoint with 403', async () => {
    const { agent } = await registerUser('JUGADOR');
    // The role check runs before the ownership/existence check, so any id works here.
    const res = await agent.get('/api/complexes/does-not-matter/schedule');
    expect(res.status).toBe(403);
  });

  it('rejects an unauthenticated request to a protected endpoint with 401', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});
