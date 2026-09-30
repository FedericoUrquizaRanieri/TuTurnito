import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { app, prisma, resetDb, registerUser, createComplexForOwner, configureCourts, dateFromToday } from './helpers';
import { outbox } from '../src/services/mailer';

/** Freezes `new Date()` at today + dayOffset, HH:MM local time. */
function setNow(time: string, dayOffset = 0) {
  vi.useFakeTimers({ toFake: ['Date'] });
  const d = new Date(vi.getRealSystemTime());
  const [h, m] = time.split(':').map(Number);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  vi.setSystemTime(d);
}

async function setup(cancellationHours = 0) {
  const { agent: owner } = await registerUser('DUEÑO');
  const complex = await createComplexForOwner(owner, { location: 'Bahía Blanca' });
  await configureCourts(owner, complex, { openTime: '08:00', closeTime: '23:00', slotMinutes: 60, basePrice: 20000 });
  if (cancellationHours) await owner.put(`/api/complexes/${complex.id}`).send({ cancellationHours });
  const { agent: organizer, user: organizerUser } = await registerUser('JUGADOR', { name: 'Olga Organizadora' });
  return { owner, complex, court: complex.courts[0], organizer, organizerUser };
}

async function turnId(complexId: string, courtId: string, date: string, startTime: string) {
  const turns = (await request(app).get(`/api/complexes/${complexId}/turns`).query({ from: date, to: date })).body.turns;
  return turns.find((t: any) => t.courtId === courtId && t.startTime === startTime).id;
}

async function bookWithMatch(agent: any, complexId: string, courtId: string, date: string, startTime: string, spots = 2) {
  const res = await agent
    .post(`/api/turns/${await turnId(complexId, courtId, date, startTime)}/reservations`)
    .send({ guestName: 'Olga', guestPhone: '2911234567', openMatch: { spots, category: 'Intermedio' } });
  expect(res.status).toBe(201);
  const matches = (await request(app).get('/api/open-matches').query({ complexId })).body.matches;
  return { reservation: res.body.reservation, match: matches.find((m: any) => m.date === date && m.startTime === startTime) };
}

describe('open matches (partido abierto)', () => {
  beforeAll(async () => {
    await resetDb();
  });
  beforeEach(() => {
    outbox.length = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('publishes a match when booking and lists it publicly without the organizer contact', async () => {
    const { complex, court, organizer } = await setup();
    const { match } = await bookWithMatch(organizer, complex.id, court.id, dateFromToday(2), '19:00');
    expect(match).toMatchObject({ spots: 2, joinedCount: 0, spotsLeft: 2, category: 'Intermedio', pricePerPlayer: 5000, organizerName: 'Olga' });
    expect(JSON.stringify(match)).not.toContain('2911234567');

    const byCity = (await request(app).get('/api/open-matches').query({ location: 'bahía' })).body.matches;
    expect(byCity.some((m: any) => m.id === match.id)).toBe(true);
  });

  it('lets players join directly until it is full, then answers 409', async () => {
    const { complex, court, organizer, organizerUser } = await setup();
    const { match } = await bookWithMatch(organizer, complex.id, court.id, dateFromToday(2), '20:00', 2);
    const { agent: p1 } = await registerUser('JUGADOR', { name: 'Pedro' });
    const { agent: p2 } = await registerUser('JUGADOR', { name: 'Pablo' });
    const { agent: p3 } = await registerUser('JUGADOR', { name: 'Paula' });

    expect((await p1.post(`/api/open-matches/${match.id}/join`)).status).toBe(201);
    expect((await p1.post(`/api/open-matches/${match.id}/join`)).status).toBe(409); // already in
    expect((await p2.post(`/api/open-matches/${match.id}/join`)).status).toBe(201);
    expect((await p3.post(`/api/open-matches/${match.id}/join`)).status).toBe(409); // full
    expect((await organizer.post(`/api/open-matches/${match.id}/join`)).status).toBe(400); // own match

    const toOrganizer = outbox.filter((m) => m.to === organizerUser.email);
    expect(toOrganizer).toHaveLength(2);
    expect(toOrganizer[1].text).toContain('completos');

    // The joined player sees it in "Mis reservas" with the organizer's contact.
    const mine = (await p1.get('/api/reservations/my')).body.reservations;
    const joined = mine.find((r: any) => r.role === 'PLAYER_JOINED');
    expect(joined.openMatch.organizer.phone).toBe('2911234567');
    expect(joined.openMatch.players.map((p: any) => p.name)).toEqual(['Pedro', 'Pablo']);
  });

  it('never lets concurrent joins go over the spots', async () => {
    const { complex, court, organizer } = await setup();
    const { match } = await bookWithMatch(organizer, complex.id, court.id, dateFromToday(3), '18:00', 1);
    const players = await Promise.all([1, 2, 3, 4].map((i) => registerUser('JUGADOR', { name: `J${i}` })));
    const results = await Promise.all(players.map(({ agent }) => agent.post(`/api/open-matches/${match.id}/join`)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await prisma.matchPlayer.count({ where: { openMatchId: match.id } })).toBe(1);
    expect((await prisma.openMatch.findUnique({ where: { id: match.id } }))?.joinedCount).toBe(1);
  });

  it('only the booker of a player reservation can publish it', async () => {
    const { complex, court, organizer } = await setup();
    const res = await organizer
      .post(`/api/turns/${await turnId(complex.id, court.id, dateFromToday(2), '10:00')}/reservations`)
      .send({ guestName: 'Olga', guestPhone: '2911234567' });
    const { agent: other } = await registerUser('JUGADOR');
    expect((await other.post(`/api/reservations/${res.body.reservation.id}/open-match`).send({ spots: 1 })).status).toBe(403);
    expect((await organizer.post(`/api/reservations/${res.body.reservation.id}/open-match`).send({ spots: 1 })).status).toBe(201);
    expect((await organizer.post(`/api/reservations/${res.body.reservation.id}/open-match`).send({ spots: 1 })).status).toBe(409);

    // A guest can't ask for players (nobody to notify).
    const guest = await request(app)
      .post(`/api/turns/${await turnId(complex.id, court.id, dateFromToday(2), '11:00')}/reservations`)
      .send({ guestName: 'Invitado', guestPhone: '2911234567', openMatch: { spots: 1 } });
    expect(guest.status).toBe(400);
  });

  it('leaving respects the cancellation policy; the organizer can remove players', async () => {
    setNow('10:00');
    const { complex, court, organizer } = await setup(24);
    const { match: soon } = await bookWithMatch(organizer, complex.id, court.id, dateFromToday(1), '09:00', 2); // 23 h ahead
    const { match: later } = await bookWithMatch(organizer, complex.id, court.id, dateFromToday(2), '09:00', 2);
    const { agent: p1, user: p1User } = await registerUser('JUGADOR', { name: 'Pedro' });
    await p1.post(`/api/open-matches/${soon.id}/join`);
    await p1.post(`/api/open-matches/${later.id}/join`);

    expect((await p1.delete(`/api/open-matches/${soon.id}/join`)).status).toBe(409);
    expect((await p1.delete(`/api/open-matches/${later.id}/join`)).status).toBe(200);
    expect((await prisma.openMatch.findUnique({ where: { id: later.id } }))?.joinedCount).toBe(0);

    expect((await organizer.delete(`/api/open-matches/${soon.id}/players/${p1User.id}`)).status).toBe(200);
    expect(outbox.some((m) => m.to === p1User.email && m.subject.includes('Ya no estás'))).toBe(true);
  });

  it('cancelling the reservation notifies the players and removes the match', async () => {
    const { complex, court, organizer } = await setup();
    const { reservation, match } = await bookWithMatch(organizer, complex.id, court.id, dateFromToday(4), '21:00', 3);
    const { agent: p1, user: p1User } = await registerUser('JUGADOR');
    await p1.post(`/api/open-matches/${match.id}/join`);
    outbox.length = 0;

    expect((await organizer.delete(`/api/reservations/${reservation.id}`)).status).toBe(200);
    expect(outbox.filter((m) => m.to === p1User.email && m.subject.includes('Se canceló'))).toHaveLength(1);
    expect(await prisma.openMatch.findUnique({ where: { id: match.id } })).toBeNull();
  });
});
