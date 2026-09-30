import prisma from '../prisma';
import { z } from 'zod';
import { HttpError } from '../middleware/HttpError';
import { releaseReservationTx } from './booking';
import { hasStarted, nowParts } from './clock';
import { addDays, ensureTurnsForRange } from './schedule.service';
import { matchCancelledEmails } from './openMatch.service';
import { MailMessage, sendMails } from './mailer';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MAX_CLOSURE_DAYS = 60;

export const closureCreateSchema = z
  .object({
    startDate: z.string().regex(DATE_REGEX, 'La fecha debe tener formato YYYY-MM-DD'),
    endDate: z.string().regex(DATE_REGEX, 'La fecha debe tener formato YYYY-MM-DD'),
    reason: z.string().trim().min(2, 'Indicá el motivo del cierre').max(60, 'El motivo no puede superar los 60 caracteres'),
    cancelConflicts: z.boolean().optional(),
  })
  .refine((b) => b.endDate >= b.startDate, {
    message: 'La fecha de fin no puede ser anterior a la de inicio',
    path: ['endDate'],
  });

export type ClosureCreateInput = z.infer<typeof closureCreateSchema>;

export type ClosureConflict = {
  reservationId: string;
  courtName: string;
  date: string;
  time: string;
  guestName: string;
  type: string;
  isRecurring: boolean;
};

export type CreateClosureResult =
  | { success: true; closure: Awaited<ReturnType<typeof prisma.closure.create>>; cancelled: number }
  | { hasConflicts: true; conflicts: ClosureConflict[] };

/** Upcoming closures of a complex (the ones that already ended aren't listed). */
export async function listClosures(complexId: string) {
  return prisma.closure.findMany({
    where: { complexId, endDate: { gte: nowParts().today } },
    orderBy: { startDate: 'asc' },
  });
}

/**
 * Closes the complex (every court) from startDate to endDate. Upcoming
 * reservations on those days are conflicts: without `cancelConflicts` nothing
 * is written and they're returned so the owner can decide; with it they're
 * cancelled. Fixed bookings and class occurrences are released without
 * `manualOverride`, so they come back if the closure is later deleted.
 */
export async function createClosure(complexId: string, input: ClosureCreateInput): Promise<CreateClosureResult> {
  const now = nowParts();
  if (input.startDate < now.today) {
    throw new HttpError(400, 'El cierre no puede empezar en una fecha pasada.');
  }
  if (input.endDate > addDays(input.startDate, MAX_CLOSURE_DAYS - 1)) {
    throw new HttpError(400, `Un cierre no puede superar los ${MAX_CLOSURE_DAYS} días.`);
  }

  let notices: MailMessage[] = [];
  const result = await prisma.$transaction(
    async (tx): Promise<CreateClosureResult> => {
      const reservations = (
        await tx.reservation.findMany({
          where: { complexId, turn: { date: { gte: input.startDate, lte: input.endDate } } },
          include: { turn: { include: { court: true } } },
          orderBy: [{ turn: { date: 'asc' } }, { turn: { startTime: 'asc' } }],
        })
      ).filter((r) => !hasStarted(r.turn.date, r.turn.startTime, now));

      if (reservations.length > 0 && !input.cancelConflicts) {
        return {
          hasConflicts: true,
          conflicts: reservations.map((r) => ({
            reservationId: r.id,
            courtName: r.turn.court.name,
            date: r.turn.date,
            time: `${r.turn.startTime} - ${r.turn.endTime}`,
            guestName: r.guestName,
            type: r.type,
            isRecurring: Boolean(r.fixedBookingId || r.classScheduleId),
          })),
        };
      }

      // Players who joined an open match on those days are told it's off.
      notices = await matchCancelledEmails(tx, reservations.map((r) => r.id));
      for (const r of reservations) {
        await releaseReservationTx(tx, r, { cancelledBy: 'OWNER' });
      }

      const closure = await tx.closure.create({
        data: { complexId, startDate: input.startDate, endDate: input.endDate, reason: input.reason },
      });

      // Blocks the turns already generated and creates the missing ones as blocked.
      await ensureTurnsForRange(complexId, input.startDate, input.endDate, tx);

      return { success: true, closure, cancelled: reservations.length };
    },
    { maxWait: 5000, timeout: 20000 }
  );
  await sendMails(notices);
  return result;
}

/** Deletes a closure: its upcoming turns are freed and fixed bookings / classes are booked again. */
export async function deleteClosure(complexId: string, closureId: string) {
  const closure = await prisma.closure.findFirst({ where: { id: closureId, complexId } });
  if (!closure) {
    throw new HttpError(404, 'Cierre no encontrado.');
  }

  await prisma.closure.delete({ where: { id: closureId } });
  // The re-sync frees every generated turn whose closure no longer exists.
  await ensureTurnsForRange(complexId, closure.startDate, closure.endDate);
}
