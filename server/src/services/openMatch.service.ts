import prisma from '../prisma';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { HttpError } from '../middleware/HttpError';
import { UserPayload } from '../middleware/auth';
import { hasStarted, minutesUntil, nowParts } from './clock';
import { openMatchEmail, OpenMatchEvent, TurnInfo } from './emails';
import { MailMessage, sendMails } from './mailer';

export const MATCH_CATEGORIES = ['Principiante', 'Intermedio', 'Avanzado', '1ra', '2da', '3ra', '4ta', '5ta', '6ta', '7ma', '8va'] as const;

// A padel match is 4 players: the organizer's group needs 1 to 3 more.
const PLAYERS_PER_MATCH = 4;

export const openMatchInputSchema = z.object({
  spots: z.number().int().min(1, 'Tiene que faltar al menos un jugador').max(3, 'Pueden faltar como máximo 3 jugadores'),
  category: z.enum(MATCH_CATEGORIES).nullable().optional(),
  notes: z.string().trim().max(140, 'La nota no puede superar los 140 caracteres').nullable().optional(),
});

export type OpenMatchInput = z.infer<typeof openMatchInputSchema>;

type ReservationForMatch = Prisma.ReservationGetPayload<{ include: { complex: true; turn: { include: { court: true } } } }>;

export function turnInfo(r: ReservationForMatch): TurnInfo {
  return {
    complexName: r.complex.name,
    complexAddress: r.complex.address,
    complexPhone: r.complex.phone,
    courtName: r.turn.court.name,
    date: r.turn.date,
    startTime: r.turn.startTime,
    endTime: r.turn.endTime,
    price: r.turn.price,
  };
}

/** Creates the open match of a reservation inside the caller's transaction (used when booking with "me faltan jugadores"). */
export function createOpenMatchTx(tx: Prisma.TransactionClient, reservationId: string, organizerId: string, input: OpenMatchInput) {
  return tx.openMatch.create({
    data: {
      reservationId,
      organizerId,
      spots: input.spots,
      category: input.category ?? null,
      notes: input.notes?.trim() || null,
    },
  });
}

/** The reservation, checked to be the requester's own upcoming player booking. */
async function getOwnUpcomingReservation(reservationId: string, requester: UserPayload) {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: {
      complex: true,
      turn: { include: { court: true } },
      openMatch: { include: { players: { include: { user: { select: { id: true, name: true, email: true } } } } } },
    },
  });
  if (!reservation) throw new HttpError(404, 'Reserva no encontrada.');
  if (reservation.userId !== requester.id) {
    throw new HttpError(403, 'Solo quien hizo la reserva puede buscar jugadores para ese turno.');
  }
  if (reservation.type !== 'PLAYER') {
    throw new HttpError(400, 'Las clases no se pueden publicar como partido abierto.');
  }
  if (hasStarted(reservation.turn.date, reservation.turn.startTime)) {
    throw new HttpError(409, 'El turno ya comenzó.');
  }
  return reservation;
}

/** Publishes an existing reservation as an open match ("me faltan jugadores"). */
export async function openMatchForReservation(reservationId: string, requester: UserPayload, input: OpenMatchInput) {
  const reservation = await getOwnUpcomingReservation(reservationId, requester);
  if (reservation.openMatch) {
    throw new HttpError(409, 'Este turno ya está publicado como partido abierto.');
  }
  try {
    return await prisma.$transaction((tx) => createOpenMatchTx(tx, reservation.id, requester.id, input));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new HttpError(409, 'Este turno ya está publicado como partido abierto.');
    }
    throw error;
  }
}

/** Changes how many players are missing, the category or the note. Can't go below the players already in. */
export async function updateOpenMatch(reservationId: string, requester: UserPayload, input: OpenMatchInput) {
  const reservation = await getOwnUpcomingReservation(reservationId, requester);
  if (!reservation.openMatch) throw new HttpError(404, 'Este turno no está publicado como partido abierto.');
  if (input.spots < reservation.openMatch.joinedCount) {
    throw new HttpError(409, `Ya se sumaron ${reservation.openMatch.joinedCount} jugadores: no podés buscar menos que eso.`);
  }
  // Guarded so a player joining meanwhile can't leave the match over capacity.
  const updated = await prisma.openMatch.updateMany({
    where: { id: reservation.openMatch.id, joinedCount: { lte: input.spots } },
    data: { spots: input.spots, category: input.category ?? null, notes: input.notes?.trim() || null },
  });
  if (updated.count === 0) throw new HttpError(409, 'Se sumó alguien recién. Revisá los lugares y probá de nuevo.');
  return prisma.openMatch.findUniqueOrThrow({ where: { id: reservation.openMatch.id } });
}

/** The organizer stops looking for players: the match is unpublished and the players who joined are notified. */
export async function closeOpenMatch(reservationId: string, requester: UserPayload) {
  const reservation = await getOwnUpcomingReservation(reservationId, requester);
  if (!reservation.openMatch) throw new HttpError(404, 'Este turno no está publicado como partido abierto.');
  await prisma.openMatch.delete({ where: { id: reservation.openMatch.id } });
  await sendMails(reservation.openMatch.players.map((p) => openMatchEmail(p.user.email, p.user.name, 'CLOSED', turnInfo(reservation), {})));
}

/**
 * Emails for the players of the open matches of these reservations, telling
 * them the match is cancelled. Built before the reservations are deleted and
 * sent by the caller once its transaction commits.
 */
export async function matchCancelledEmails(client: Prisma.TransactionClient | typeof prisma, reservationIds: string[]): Promise<MailMessage[]> {
  if (reservationIds.length === 0) return [];
  const matches = await client.openMatch.findMany({
    where: { reservationId: { in: reservationIds } },
    include: {
      reservation: { include: { complex: true, turn: { include: { court: true } } } },
      players: { include: { user: { select: { name: true, email: true } } } },
    },
  });
  return matches.flatMap((m) => m.players.map((p) => openMatchEmail(p.user.email, p.user.name, 'CANCELLED', turnInfo(m.reservation), {})));
}

export interface OpenMatchFilters {
  complexId?: string;
  location?: string;
  date?: string;
  category?: string;
}

/**
 * Public feed of open matches that still have room and haven't started. The
 * organizer's contact isn't exposed here: players see it once they join.
 */
export async function listOpenMatches(filters: OpenMatchFilters, viewer?: UserPayload) {
  const now = nowParts();
  const matches = await prisma.openMatch.findMany({
    where: {
      ...(filters.category ? { category: filters.category } : {}),
      reservation: {
        ...(filters.complexId ? { complexId: filters.complexId } : {}),
        ...(filters.location ? { complex: { location: { contains: filters.location, mode: 'insensitive' } } } : {}),
        turn: { date: filters.date ? filters.date : { gte: now.today } },
      },
    },
    include: {
      organizer: { select: { id: true, name: true } },
      players: { select: { userId: true } },
      reservation: {
        include: {
          complex: { select: { id: true, name: true, slug: true, location: true, address: true } },
          turn: { include: { court: { select: { name: true } } } },
        },
      },
    },
    orderBy: [{ reservation: { turn: { date: 'asc' } } }, { reservation: { turn: { startTime: 'asc' } } }],
  });

  return matches
    .filter((m) => !hasStarted(m.reservation.turn.date, m.reservation.turn.startTime, now))
    .map((m) => {
      const joined = viewer ? m.players.some((p) => p.userId === viewer.id) : false;
      const isOrganizer = viewer?.id === m.organizerId;
      return {
        id: m.id,
        complex: m.reservation.complex,
        courtName: m.reservation.turn.court.name,
        date: m.reservation.turn.date,
        startTime: m.reservation.turn.startTime,
        endTime: m.reservation.turn.endTime,
        price: m.reservation.turn.price,
        pricePerPlayer: Math.round(m.reservation.turn.price / PLAYERS_PER_MATCH),
        spots: m.spots,
        joinedCount: m.joinedCount,
        spotsLeft: m.spots - m.joinedCount,
        category: m.category,
        notes: m.notes,
        organizerName: m.organizer.name.split(' ')[0],
        joined,
        isOrganizer,
      };
    })
    // Full matches only stay visible to the ones playing them.
    .filter((m) => m.spotsLeft > 0 || m.joined || m.isOrganizer);
}

async function getMatchWithReservation(matchId: string) {
  const match = await prisma.openMatch.findUnique({
    where: { id: matchId },
    include: {
      organizer: { select: { id: true, name: true, email: true, emailReminders: true } },
      reservation: { include: { complex: true, turn: { include: { court: true } } } },
    },
  });
  if (!match) throw new HttpError(404, 'Ese partido ya no está publicado.');
  return match;
}

function notifyOrganizer(match: Awaited<ReturnType<typeof getMatchWithReservation>>, event: OpenMatchEvent, playerName: string, spotsLeft: number) {
  return sendMails([openMatchEmail(match.organizer.email, match.organizer.name, event, turnInfo(match.reservation), { playerName, spotsLeft })]);
}

/** A player joins an open match; it's direct (no approval) while there's room. */
export async function joinOpenMatch(matchId: string, user: UserPayload) {
  const match = await getMatchWithReservation(matchId);
  if (match.organizerId === user.id) throw new HttpError(400, 'Es tu propio partido.');
  if (hasStarted(match.reservation.turn.date, match.reservation.turn.startTime)) {
    throw new HttpError(409, 'Este partido ya comenzó.');
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Guarded increment: under concurrent joins only as many as there are spots get in.
      const taken = await tx.$executeRaw`UPDATE "OpenMatch" SET "joinedCount" = "joinedCount" + 1, "updatedAt" = NOW() WHERE "id" = ${matchId} AND "joinedCount" < "spots"`;
      if (taken === 0) throw new HttpError(409, 'El partido ya se completó.');
      await tx.matchPlayer.create({ data: { openMatchId: matchId, userId: user.id } });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new HttpError(409, 'Ya estás anotado en este partido.');
    }
    throw error;
  }

  const updated = await prisma.openMatch.findUniqueOrThrow({ where: { id: matchId } });
  await notifyOrganizer(match, 'JOINED', user.name, updated.spots - updated.joinedCount);
  return updated;
}

/** A player leaves a match they joined, bound by the complex's cancellation policy. */
export async function leaveOpenMatch(matchId: string, user: UserPayload) {
  const match = await getMatchWithReservation(matchId);
  const { turn, complex } = match.reservation;
  const now = nowParts();
  if (hasStarted(turn.date, turn.startTime, now)) throw new HttpError(409, 'Este partido ya comenzó.');
  const hours = complex.cancellationHours;
  if (hours > 0 && minutesUntil(turn.date, turn.startTime, now) < hours * 60) {
    throw new HttpError(409, `Ya pasó el plazo para bajarte desde la app (${hours} h antes). Avisale al organizador.`);
  }

  await removePlayerTx(matchId, user.id);
  const updated = await prisma.openMatch.findUniqueOrThrow({ where: { id: matchId } });
  await notifyOrganizer(match, 'LEFT', user.name, updated.spots - updated.joinedCount);
}

/** The organizer removes a player from their match. */
export async function removePlayer(matchId: string, organizer: UserPayload, playerId: string) {
  const match = await getMatchWithReservation(matchId);
  if (match.organizerId !== organizer.id) throw new HttpError(403, 'Solo el organizador puede sacar jugadores.');
  const player = await prisma.user.findUnique({ where: { id: playerId }, select: { name: true, email: true } });
  await removePlayerTx(matchId, playerId);
  if (player) await sendMails([openMatchEmail(player.email, player.name, 'REMOVED', turnInfo(match.reservation), {})]);
}

async function removePlayerTx(matchId: string, userId: string) {
  await prisma.$transaction(async (tx) => {
    const removed = await tx.matchPlayer.deleteMany({ where: { openMatchId: matchId, userId } });
    if (removed.count === 0) throw new HttpError(404, 'Ese jugador no está anotado en el partido.');
    await tx.openMatch.update({ where: { id: matchId }, data: { joinedCount: { decrement: 1 } } });
  });
}
