import prisma from '../prisma';
import { Prisma, Reservation, Turn, Payment, ReservationType, PaymentStatus } from '@prisma/client';
import { HttpError } from '../middleware/HttpError';
import { UserPayload } from '../middleware/auth';
import { formatDate } from './schedule.service';
import { buildPaymentMap, getPaymentsByPayableIds, findOrCreatePaymentForPayable } from './payment.service';
import { bookTurnTx, releaseReservationTx } from './booking';

export interface CreateReservationInput {
  guestName: string;
  guestPhone: string;
  guestEmail?: string;
  type: ReservationType;
  notes?: string;
}

export type CreateReservationResult =
  | { success: true; reservation: Reservation; turn: Turn; payment: Payment }
  | { success: false; conflictType: 'OCCUPIED' | 'BLOCKED' | 'NOT_FOUND'; message: string };

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

/** Cancels a reservation: frees the turn, drops its payment, deletes the reservation row. */
export async function cancelReservation(reservationId: string, requester: UserPayload): Promise<void> {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: { complex: true, turn: { include: { court: true } } },
  });

  if (!reservation) {
    throw new HttpError(404, 'Reserva no encontrada.');
  }

  assertCanCancelReservation(reservation, requester);

  // Cancelling one occurrence of a fixed booking or a professor's class
  // schedule flags the turn so the generator doesn't book that date again.
  const isRecurring = Boolean(reservation.fixedBookingId || reservation.classScheduleId);
  await prisma.$transaction((tx) =>
    releaseReservationTx(tx, reservation, isRecurring ? { manualOverride: true } : {})
  );
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

/** "Mis reservas" — every reservation tied to this user's account or guest email. */
export async function getMyReservations(userId: string, userEmail: string) {
  const reservations = await prisma.reservation.findMany({
    where: { OR: [{ userId }, { guestEmail: userEmail }] },
    include: { complex: true, turn: { include: { court: true } } },
    orderBy: [{ turn: { date: 'desc' } }, { turn: { startTime: 'desc' } }],
  });

  const payments = await getPaymentsByPayableIds('RESERVATION', reservations.map((r) => r.id));
  const paymentMap = buildPaymentMap(payments);
  const todayStr = formatDate(new Date());

  return reservations.map((r) => {
    const p = paymentMap.get(r.id);
    return {
      id: r.id,
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
      paymentStatus: p?.status || 'PENDING',
      isPast: r.turn.date < todayStr,
      createdAt: r.createdAt,
    };
  });
}
