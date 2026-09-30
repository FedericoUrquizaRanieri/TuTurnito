import { CancelledBy, Prisma, ReservationType } from '@prisma/client';
import { minutesUntil } from './clock';

export interface BookTurnInput {
  complexId: string;
  userId: string | null;
  guestName: string;
  guestPhone: string;
  guestEmail?: string | null;
  type: ReservationType;
  professorId?: string | null;
  notes?: string | null;
  fixedBookingId?: string | null;
  classScheduleId?: string | null;
  recordedById: string;
  paymentNote: string;
}

/**
 * Books one turn inside the caller's transaction: flips it to OCCUPIED,
 * creates the Reservation and its initial PENDING Payment.
 *
 * Shared by player/owner bookings (reservation.service.ts) and by the fixed
 * booking / class schedule generators (schedule.service.ts), so it lives in
 * its own module instead of creating a circular import between them.
 *
 * The state flip is a guarded `updateMany` (only AVAILABLE turns): under
 * Postgres READ COMMITTED a concurrent writer on the same row waits and then
 * re-evaluates the WHERE, so exactly one caller wins and the other gets
 * `null` back instead of a unique-constraint error that would abort its
 * whole transaction.
 */
export async function bookTurnTx(
  tx: Prisma.TransactionClient,
  turn: { id: string; price: number; date: string },
  input: BookTurnInput,
  options: { requireNoOverride?: boolean } = {}
) {
  const flipped = await tx.turn.updateMany({
    where: {
      id: turn.id,
      state: 'AVAILABLE',
      ...(options.requireNoOverride ? { manualOverride: false } : {}),
    },
    data: { state: 'OCCUPIED' },
  });
  if (flipped.count === 0) return null;

  const reservation = await tx.reservation.create({
    data: {
      turnId: turn.id,
      complexId: input.complexId,
      userId: input.userId,
      guestName: input.guestName.trim(),
      guestPhone: input.guestPhone.trim(),
      guestEmail: input.guestEmail?.trim() || null,
      type: input.type,
      professorId: input.professorId ?? null,
      notes: input.notes?.trim() || null,
      fixedBookingId: input.fixedBookingId ?? null,
      classScheduleId: input.classScheduleId ?? null,
    },
  });

  const payment = await tx.payment.create({
    data: {
      payableType: 'RESERVATION',
      payableId: reservation.id,
      amount: turn.price,
      status: 'PENDING',
      date: turn.date,
      recordedById: input.recordedById,
      notes: input.paymentNote,
    },
  });

  return { reservation, payment };
}

/**
 * Undoes a booking inside the caller's transaction: frees the turn, drops the
 * payment and the reservation row, and records the cancellation (who and how
 * far ahead) for the owner's analytics.
 */
export async function releaseReservationTx(
  tx: Prisma.TransactionClient,
  reservation: { id: string; turnId: string },
  options: { manualOverride?: boolean; cancelledBy: CancelledBy }
) {
  const full = await tx.reservation.findUniqueOrThrow({ where: { id: reservation.id }, include: { turn: true } });
  await tx.reservationCancellation.create({
    data: {
      complexId: full.complexId,
      courtId: full.turn.courtId,
      date: full.turn.date,
      startTime: full.turn.startTime,
      price: full.turn.price,
      type: full.type,
      wasFixed: Boolean(full.fixedBookingId),
      guestName: full.guestName,
      guestPhone: full.guestPhone,
      cancelledBy: options.cancelledBy,
      minutesBefore: Math.max(0, minutesUntil(full.turn.date, full.turn.startTime)),
    },
  });

  const turnData = options.manualOverride === undefined ? {} : { manualOverride: options.manualOverride };
  await tx.turn.update({ where: { id: reservation.turnId }, data: { state: 'AVAILABLE', ...turnData } });
  await tx.payment.deleteMany({ where: { payableType: 'RESERVATION', payableId: reservation.id } });
  await tx.reservation.delete({ where: { id: reservation.id } });
}
