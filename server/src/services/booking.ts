import { Prisma, ReservationType } from '@prisma/client';

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
  recordedById: string;
  paymentNote: string;
}

/**
 * Books one turn inside the caller's transaction: flips it to OCCUPIED,
 * creates the Reservation and its initial PENDING Payment.
 *
 * Shared by player/owner bookings (reservation.service.ts) and by the fixed
 * booking generator (schedule.service.ts), so it lives in its own module
 * instead of creating a circular import between those two services.
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

/** Undoes a booking inside the caller's transaction: frees the turn, drops the payment and the reservation row. */
export async function releaseReservationTx(
  tx: Prisma.TransactionClient,
  reservation: { id: string; turnId: string },
  turnData: { manualOverride?: boolean } = {}
) {
  await tx.turn.update({ where: { id: reservation.turnId }, data: { state: 'AVAILABLE', ...turnData } });
  await tx.payment.deleteMany({ where: { payableType: 'RESERVATION', payableId: reservation.id } });
  await tx.reservation.delete({ where: { id: reservation.id } });
}
