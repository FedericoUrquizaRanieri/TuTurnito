import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app, resetDb, registerUser, createComplexForOwner } from './helpers';

describe('complexes', () => {
  beforeAll(async () => {
    await resetDb();
  });

  it('filters the public catalog by search term and by location', async () => {
    const { agent: ownerA } = await registerUser('DUEÑO');
    await createComplexForOwner(ownerA, { name: 'Pádel Palermo Club', location: 'Palermo, CABA' });

    const { agent: ownerB } = await registerUser('DUEÑO');
    await createComplexForOwner(ownerB, { name: 'Bahía Pádel Center', location: 'Bahía Blanca' });

    const all = await request(app).get('/api/complexes');
    expect(all.status).toBe(200);
    expect(all.body.complexes.length).toBeGreaterThanOrEqual(2);

    const bySearch = await request(app).get('/api/complexes').query({ search: 'Palermo' });
    expect(bySearch.body.complexes.length).toBeGreaterThan(0);
    expect(
      bySearch.body.complexes.every((c: any) => c.name.includes('Palermo') || c.location.includes('Palermo'))
    ).toBe(true);

    const byLocation = await request(app).get('/api/complexes').query({ location: 'Bahía Blanca' });
    expect(byLocation.body.complexes.some((c: any) => c.name === 'Bahía Pádel Center')).toBe(true);
    expect(byLocation.body.complexes.every((c: any) => c.location.includes('Bahía Blanca'))).toBe(true);
  });

  it('lets an owner create a complex (with default courts) and blocks another owner from editing it', async () => {
    const { agent: owner } = await registerUser('DUEÑO');
    const complex = await createComplexForOwner(owner, { name: 'Mi Club' });

    expect(complex.id).toBeDefined();
    expect(complex.courts.length).toBe(2);

    const { agent: otherOwner } = await registerUser('DUEÑO');
    const blocked = await otherOwner.put(`/api/complexes/${complex.id}`).send({ name: 'Hackeado' });
    expect(blocked.status).toBe(403);

    const okUpdate = await owner.put(`/api/complexes/${complex.id}`).send({ name: 'Mi Club Renovado' });
    expect(okUpdate.status).toBe(200);
    expect(okUpdate.body.complex.name).toBe('Mi Club Renovado');
  });

  it('returns 404 for a complex that does not exist', async () => {
    const res = await request(app).get('/api/complexes/does-not-exist');
    expect(res.status).toBe(404);
  });
});
