import prisma from '../prisma';
import { Prisma, Reservation, Turn, Payment, ReservationType, PaymentStatus } from '@prisma/client';
import { HttpError } from '../middleware/HttpError';
import { UserPayload } from '../middleware/auth';
import { hasStarted, nowParts, minutesUntil, minutesBefore, NowParts } from './clock';
import { buildPaymentMap, getPaymentsByPayableIds, findOrCreatePaymentForPayable } from './payment.service';
import { bookTurnTx, releaseReservationTx } from './booking';
import { createOpenMatchTx, matchCancelledEmails, OpenMatchInput } from './openMatch.service';
import { sendMails } from './mailer';

export interface CreateReservationInput {
  guestName: string;
  guestPhone: string;
  guestEmail?: string;
  type: ReservationType;
  notes?: string;
  /** "Me faltan jugadores": publishes the booking as an open match right away. */
  openMatch?: OpenMatchInput;
}

export type CreateReservationResult =
  | { success: true; reservation: Reservation; turn: Turn; payment: Payment }
  | { success: false; conflictType: 'OCCUPIED' | 'BLOCKED' | 'STARTED' | 'NOT_FOUND'; message: string };

/**
 * Creates a reservation for a turn inside one atomic transaction (turn ->
 * OCCUPIED, reservation row, initial PENDING payment). Business conflicts
 * (turn already taken/blocked/missing) are returned as a structured result
 * instead of thrown — same convention as schedule.service.ts's
 * saveComplexCourts — so the route can branch on it without parsing
 * error-message prefixes. A genuine last-write race (both requests pass the
 * in-transaction check before either commits) still surfaces as a Prisma
 * P2002 on the unique `Reservation.turnId`, caught below and folded into
 * the same OCCUPIED result shape.
 */
export async function createReservation(
  turnId: string,
  input: CreateReservationInput,
  requester: UserPayload | undefined
): Promise<CreateReservationResult> {
  if (input.type === 'CLASS') {
    if (!requester || requester.role !== 'PROFESOR') {
      throw new HttpError(403, 'Solo profesores autenticados pueden registrar reservas de clase.');
    }

    const turnInfo = await prisma.turn.findUnique({ where: { id: turnId }, include: { court: true } });
    if (!turnInfo) {
      throw new HttpError(404, 'Turno no encontrado.');
    }

    const isLinked = await prisma.professorComplex.findUnique({
      where: { professorId_complexId: { professorId: requester.id, complexId: turnInfo.court.complexId } },
    });

    if (!isLinked || !isLinked.active) {
      throw new HttpError(403, 'No estás autorizado en este complejo para reservar clases.');
    }
  }

  if (input.openMatch && (!requester || input.type !== 'PLAYER')) {
    throw new HttpError(400, 'Para buscar jugadores tenés que reservar con tu cuenta.');
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const turn = await tx.turn.findUnique({
        where: { id: turnId },
        include: { court: { include: { complex: true } }, reservation: true },
      });

      if (!turn) {
        return { success: false, conflictType: 'NOT_FOUND', message: 'Turno no encontrado.' } as const;
      }
      if (turn.state === 'OCCUPIED' || turn.reservation) {
        return { success: false, conflictType: 'OCCUPIED', message: 'Este turno acaba de ser reservado por otro usuario.' } as const;
      }
      if (turn.state === 'BLOCKED' || turn.state === 'TOURNAMENT') {
        return { success: false, conflictType: 'BLOCKED', message: 'Este turno se encuentra bloqueado y no está disponible para reserva.' } as const;
      }
      if (hasStarted(turn.date, turn.startTime)) {
        return { success: false, conflictType: 'STARTED', message: 'Este turno ya comenzó y no se puede reservar.' } as const;
      }

      const complex = turn.court.complex;
      // An owner booking by hand (phone/walk-in) books on behalf of the
      // client: the reservation isn't tied to the owner's own account.
      const isOwnerBooking = requester?.id === complex.ownerId;

      const booked = await bookTurnTx(tx, turn, {
        complexId: complex.id,
        userId: requester && !isOwnerBooking ? requester.id : null,
        guestName: input.guestName,
        guestPhone: input.guestPhone,
        guestEmail: input.guestEmail,
        type: input.type,
        professorId: input.type === 'CLASS' && requester ? requester.id : null,
        notes: input.notes,
        recordedById: requester ? requester.id : complex.ownerId,
        paymentNote: `Reserva creada para ${input.guestName}`,
      });

      if (!booked) {
        return { success: false, conflictType: 'OCCUPIED', message: 'Este turno acaba de ser reservado por otro usuario.' } as const;
      }

      if (input.openMatch && requester && !isOwnerBooking) {
        await createOpenMatchTx(tx, booked.reservation.id, requester.id, input.openMatch);
      }

      const updatedTurn = await tx.turn.findUniqueOrThrow({ where: { id: turnId } });
      return { success: true, reservation: booked.reservation, turn: updatedTurn, payment: booked.payment } as const;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { success: false, conflictType: 'OCCUPIED', message: 'Este turno acaba de ser reservado por otro usuario.' };
    }
    throw error;
  }
}

function assertCanCancelReservation(
  reservation: { userId: string | null; complex: { ownerId: string } },
  user: UserPayload
) {
  // Only the account that booked it (or the owner). A booking the owner
  // loaded with a client's email shows up in that client's "Mis reservas",
  // but emails aren't verified, so matching one isn't proof enough to cancel.
  const isPlayerWhoBooked = reservation.userId === user.id;
  const isOwner = reservation.complex.ownerId === user.id;
  if (!isPlayerWhoBooked && !isOwner) {
    throw new HttpError(403, 'No tienes permiso para cancelar esta reserva.');
  }
}

function assertOwnsReservationComplex(reservation: { complex: { ownerId: string } }, user: UserPayload) {
  if (reservation.complex.ownerId !== user.id) {
    throw new HttpError(403, 'No tienes permiso para registrar pagos en este complejo.');
  }
}

/**
 * Until when a player may cancel a turn from the app: `cancellationHours`
 * before it starts (the start itself when the complex has no policy).
 */
export function cancelDeadline(turn: { date: string; startTime: string }, cancellationHours: number): NowParts {
  return minutesBefore(turn.date, turn.startTime, cancellationHours * 60);
}

/**
 * Cancels a reservation: frees the turn, drops its payment, deletes the
 * reservation row and records the cancellation. Players are bound by the
 * complex's cancellation policy (hours before the turn); the owner isn't.
 */
export async function cancelReservation(reservationId: string, requester: UserPayload): Promise<void> {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: { complex: true, turn: { include: { court: true } } },
  });

  if (!reservation) {
    throw new HttpError(404, 'Reserva no encontrada.');
  }

  assertCanCancelReservation(reservation, requester);

  // Once it started it took place (and a class was charged to its students):
  // nobody can cancel it, not even the owner.
  const now = nowParts();
  if (hasStarted(reservation.turn.date, reservation.turn.startTime, now)) {
    throw new HttpError(409, 'No se puede cancelar un turno que ya comenzó.');
  }

  const isOwner = reservation.complex.ownerId === requester.id;
  const hours = reservation.complex.cancellationHours;
  if (!isOwner && reservation.type === 'PLAYER' && hours > 0 && minutesUntil(reservation.turn.date, reservation.turn.startTime, now) < hours * 60) {
    const contact = reservation.complex.phone ? ` al ${reservation.complex.phone}` : '';
    throw new HttpError(
      409,
      `Este complejo permite cancelar desde la app hasta ${hours} h antes del turno. Comunicate con el complejo${contact} para cancelarlo.`
    );
  }

  // Cancelling one occurrence of a fixed booking or a professor's class
  // schedule flags the turn so the generator doesn't book that date again.
  const isRecurring = Boolean(reservation.fixedBookingId || reservation.classScheduleId);
  const notices = await prisma.$transaction(async (tx) => {
    // The players who joined its open match are told it's off.
    const emails = await matchCancelledEmails(tx, [reservation.id]);
    await releaseReservationTx(tx, reservation, {
      ...(isRecurring ? { manualOverride: true } : {}),
      cancelledBy: isOwner ? 'OWNER' : reservation.type === 'CLASS' ? 'PROFESSOR' : 'PLAYER',
    });
    return emails;
  });
  await sendMails(notices);
}

/** Owner's view of a complex's reservations (optionally within a date range), joined with payment status and totals. */
export async function getOwnerReservationsView(complexId: string, range: { from?: string; to?: string } = {}) {
  const dateFilter: { gte?: string; lte?: string } = {};
  if (range.from) dateFilter.gte = range.from;
  if (range.to) dateFilter.lte = range.to;

  const reservations = await prisma.reservation.findMany({
    where: { complexId, ...(range.from || range.to ? { turn: { date: dateFilter } } : {}) },
    include: {
      turn: { include: { court: true } },
      user: { select: { id: true, name: true, email: true, phone: true } },
      professor: { select: { id: true, name: true, phone: true } },
    },
    orderBy: [{ turn: { date: 'desc' } }, { turn: { startTime: 'desc' } }],
  });

  const payments = await getPaymentsByPayableIds('RESERVATION', reservations.map((r) => r.id));
  const paymentMap = buildPaymentMap(payments);

  let totalCollected = 0;
  let totalPending = 0;

  const formatted = reservations.map((r) => {
    const p = paymentMap.get(r.id);
    const isPaid = p?.status === 'PAID';
    // Falls back to the turn's price when no payment row exists yet (a
    // fresh reservation always gets one at creation time, but this stays
    // defensive rather than assuming).
    const amount = p ? p.amount : r.turn.price;

    if (isPaid) totalCollected += amount;
    else totalPending += amount;

    return {
      id: r.id,
      turnId: r.turnId,
      date: r.turn.date,
      time: `${r.turn.startTime} - ${r.turn.endTime}`,
      courtName: r.turn.court.name,
      guestName: r.guestName,
      guestPhone: r.guestPhone,
      guestEmail: r.guestEmail,
      type: r.type,
      fixedBookingId: r.fixedBookingId,
      user: r.user,
      professor: r.professor,
      price: r.turn.price,
      paymentStatus: p?.status || 'PENDING',
      paymentAmount: amount,
      paymentId: p?.id,
      createdAt: r.createdAt,
    };
  });

  return {
    reservations: formatted,
    stats: { totalReservations: formatted.length, totalCollected, totalPending },
  };
}

export interface UpdateReservationPaymentInput {
  status?: PaymentStatus;
  amount?: number;
}

/** Owner registers/toggles the payment for a reservation (one payment per reservation). */
export async function updateReservationPayment(
  reservationId: string,
  requester: UserPayload,
  input: UpdateReservationPaymentInput
): Promise<Payment> {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: { complex: true, turn: true },
  });

  if (!reservation) {
    throw new HttpError(404, 'Reserva no encontrada.');
  }

  assertOwnsReservationComplex(reservation, requester);

  const finalStatus: PaymentStatus = input.status === 'PAID' ? 'PAID' : 'PENDING';
  const finalAmount = typeof input.amount === 'number' ? input.amount : reservation.turn.price;

  return findOrCreatePaymentForPayable('RESERVATION', reservationId, {
    status: finalStatus,
    amount: finalAmount,
    recordedById: requester.id,
  });
}

const myReservationInclude = {
  complex: true,
  turn: { include: { court: true } },
  user: { select: { name: true, phone: true } },
  openMatch: {
    include: {
      players: { include: { user: { select: { id: true, name: true, phone: true } } }, orderBy: { joinedAt: 'asc' } },
    },
  },
} satisfies Prisma.ReservationInclude;

type MyReservationRow = Prisma.ReservationGetPayload<{ include: typeof myReservationInclude }>;

/**
 * "Mis reservas" — every reservation tied to this user's account or guest
 * email, plus the open matches they joined (role PLAYER_JOINED). Each one
 * carries its open match with the players, visible to the ones in it.
 */
export async function getMyReservations(userId: string, userEmail: string) {
  const [own, joined] = await Promise.all([
    prisma.reservation.findMany({
      // By email only the reservations made as a guest (without an account):
      // one booked by another user with my email isn't mine.
      where: { OR: [{ userId }, { userId: null, guestEmail: { equals: userEmail, mode: 'insensitive' } }] },
      include: myReservationInclude,
    }),
    prisma.reservation.findMany({
      where: { openMatch: { players: { some: { userId } } } },
      include: myReservationInclude,
    }),
  ]);

  const payments = await getPaymentsByPayableIds('RESERVATION', own.map((r) => r.id));
  const paymentMap = buildPaymentMap(payments);
  const now = nowParts();

  const format = (r: MyReservationRow, role: 'BOOKER' | 'PLAYER_JOINED') => {
    const p = paymentMap.get(r.id);
    const deadline = cancelDeadline(r.turn, r.complex.cancellationHours);
    const m = r.openMatch;
    return {
      id: r.id,
      role,
      complexId: r.complexId,
      complexName: r.complex.name,
      complexAddress: r.complex.address,
      complexPhone: r.complex.phone,
      courtName: r.turn.court.name,
      date: r.turn.date,
      startTime: r.turn.startTime,
      endTime: r.turn.endTime,
      price: r.turn.price,
      type: r.type,
      paymentStatus: role === 'BOOKER' ? p?.status || 'PENDING' : null,
      // Started = past: it can no longer be cancelled.
      isPast: hasStarted(r.turn.date, r.turn.startTime, now),
      cancellationHours: r.complex.cancellationHours,
      /** Until when the player can cancel (or leave the match) from the app (local date and time). */
      cancelDeadline: { date: deadline.today, time: deadline.time },
      /** The complex loaded it with my email (not booked from my account): only the complex can cancel it. */
      loadedByComplex: role === 'BOOKER' && r.userId !== userId,
      // The policy applies to player bookings; a professor's class can be cancelled until it starts.
      // Bookings matched only by email (loaded by the owner) are cancelled through the complex.
      canCancel: (role !== 'BOOKER' || r.userId === userId) && !hasStarted(r.type === 'PLAYER' ? deadline.today : r.turn.date, r.type === 'PLAYER' ? deadline.time : r.turn.startTime, now),
      openMatch: m
        ? {
            id: m.id,
            spots: m.spots,
            joinedCount: m.joinedCount,
            category: m.category,
            notes: m.notes,
            // The phone left on the booking is the one to coordinate the match.
            organizer: { name: r.user?.name ?? r.guestName, phone: r.guestPhone },
            players: m.players.map((pl) => ({ userId: pl.user.id, name: pl.user.name, phone: pl.user.phone })),
          }
        : null,
      createdAt: r.createdAt,
    };
  };

  const ownIds = new Set(own.map((r) => r.id));
  return [...own.map((r) => format(r, 'BOOKER')), ...joined.filter((r) => !ownIds.has(r.id)).map((r) => format(r, 'PLAYER_JOINED'))].sort(
    (a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime)
  );
}
