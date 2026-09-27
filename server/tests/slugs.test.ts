import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app, resetDb, registerUser, createComplexForOwner } from './helpers';

describe('complex public slugs', () => {
  beforeAll(async () => {
    await resetDb();
  });

  it('derives a clean slug from the name and serves the public detail by slug', async () => {
    const { agent: owner } = await registerUser('DUEÑO');
    const complex = await createComplexForOwner(owner, { name: 'Pádel Ñandú  Club!' });
    expect(complex.slug).toBe('padel-nandu-club');

    const bySlug = await request(app).get('/api/complexes/padel-nandu-club');
    expect(bySlug.status).toBe(200);
    expect(bySlug.body.complex.id).toBe(complex.id);

    // The id keeps working, so links shared before slugs existed don't break.
    const byId = await request(app).get(`/api/complexes/${complex.id}`);
    expect(byId.body.complex.slug).toBe('padel-nandu-club');

    const catalog = await request(app).get('/api/complexes');
    expect(catalog.body.complexes.find((c: any) => c.id === complex.id).slug).toBe('padel-nandu-club');
  });

  it('adds a numeric suffix when two complexes share a name, and avoids reserved words', async () => {
    const { agent: owner } = await registerUser('DUEÑO');
    const first = await createComplexForOwner(owner, { name: 'Club Repetido' });
    const second = await createComplexForOwner(owner, { name: 'Club Repetido' });
    expect(first.slug).toBe('club-repetido');
    expect(second.slug).toBe('club-repetido-2');

    const reserved = await createComplexForOwner(owner, { name: 'Owner' });
    expect(reserved.slug).toBe('owner-club');
  });

  it('lets the owner customize the slug, rejecting invalid, reserved and taken ones', async () => {
    const { agent: owner } = await registerUser('DUEÑO');
    const complex = await createComplexForOwner(owner, { name: 'Mi Club Original' });
    const other = await createComplexForOwner(owner, { name: 'Otro Club Ocupado' });

    const ok = await owner.put(`/api/complexes/${complex.id}`).send({ slug: 'Mi-Club' });
    expect(ok.status).toBe(200);
    expect(ok.body.complex.slug).toBe('mi-club');

    expect((await owner.put(`/api/complexes/${complex.id}`).send({ slug: 'con espacio' })).status).toBe(400);
    expect((await owner.put(`/api/complexes/${complex.id}`).send({ slug: 'auth' })).status).toBe(400);
    expect((await owner.put(`/api/complexes/${complex.id}`).send({ slug: other.slug })).status).toBe(409);

    // Renaming doesn't silently change the URL the club already shared.
    const renamed = await owner.put(`/api/complexes/${complex.id}`).send({ name: 'Nombre Nuevo' });
    expect(renamed.body.complex.slug).toBe('mi-club');

    const { agent: stranger } = await registerUser('DUEÑO');
    expect((await stranger.put(`/api/complexes/${complex.id}`).send({ slug: 'robado' })).status).toBe(403);
  });
});
