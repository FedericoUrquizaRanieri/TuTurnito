import prisma from '../prisma';
import { z } from 'zod';
import { HttpError } from '../middleware/HttpError';
import { releaseReservationTx } from './booking';
import { TIME_REGEX, addDays, buildCourtSlots, ensureTurnsForRange, formatDate, parseDateString } from './schedule.service';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// How far ahead a new fixed booking is materialized right away, so the owner
// immediately sees which upcoming dates couldn't be booked. Later weeks get
// booked whenever their turns are generated (any grid/calendar view).
const MATERIALIZE_DAYS = 13;

export const fixedBookingCreateSchema = z
  .object({
    courtId: z.string().min(1, 'La cancha es requerida'),
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: z.string().regex(TIME_REGEX, 'La hora debe tener formato HH:MM'),
    guestName: z.string().min(2, 'El nombre es requerido'),
    guestPhone: z.string().min(6, 'El teléfono es requerido'),
    notes: z.string().optional(),
    startDate: z.string().regex(DATE_REGEX, 'La fecha debe tener formato YYYY-MM-DD').optional(),
    endDate: z.string().regex(DATE_REGEX, 'La fecha debe tener formato YYYY-MM-DD').optional().or(z.literal('')),
  })
  .refine((b) => !b.endDate || !b.startDate || b.endDate >= b.startDate, {
    message: 'La fecha de fin no puede ser anterior a la de inicio',
    path: ['endDate'],
  });

export type FixedBookingCreateInput = z.infer<typeof fixedBookingCreateSchema>;

export async function listFixedBookings(complexId: string) {
  return prisma.fixedBooking.findMany({
    where: { complexId, active: true },
    include: { court: { select: { id: true, name: true } } },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  });
}

/**
 * Creates a fixed booking (same court, weekday and time every week) and
 * books the upcoming occurrences. Returns the dates in that window that
 * couldn't be booked because the turn was already taken, blocked or a
 * tournament.
 */
export async function createFixedBooking(complexId: string, input: FixedBookingCreateInput) {
  const court = await prisma.court.findFirst({ where: { id: input.courtId, complexId, active: true } });
  if (!court) {
    throw new HttpError(404, 'Cancha no encontrada.');
  }
  if (!buildCourtSlots(court).some((s) => s.start === input.startTime)) {
    throw new HttpError(400, 'Ese horario no existe en el rango de la cancha.');
  }

  const todayStr = formatDate(new Date());
  const startDate = input.startDate && input.startDate > todayStr ? input.startDate : todayStr;

  const duplicate = await prisma.fixedBooking.findFirst({
    where: { courtId: court.id, dayOfWeek: input.dayOfWeek, startTime: input.startTime, active: true },
  });
  if (duplicate) {
    throw new HttpError(409, `Ya existe un turno fijo en ese horario (${duplicate.guestName}).`);
  }

  const fixedBooking = await prisma.fixedBooking.create({
    data: {
      complexId,
      courtId: court.id,
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      guestName: input.guestName.trim(),
      guestPhone: input.guestPhone.trim(),
      notes: input.notes?.trim() || null,
      startDate,
      endDate: input.endDate || null,
    },
  });

  const windowEnd = addDays(todayStr, MATERIALIZE_DAYS);
  const turns = await ensureTurnsForRange(complexId, startDate, windowEnd);

  const skippedDates = turns
    .filter(
      (t) =>
        t.courtId === court.id &&
        t.startTime === input.startTime &&
        parseDateString(t.date).dayOfWeek === input.dayOfWeek &&
        (!fixedBooking.endDate || t.date <= fixedBooking.endDate) &&
        t.reservation?.fixedBookingId !== fixedBooking.id
    )
    .map((t) => t.date);

  return { fixedBooking, skippedDates };
}

/**
 * Ends a fixed booking. With `cancelFuture`, its upcoming reservations are
 * cancelled too (turns freed, payments dropped); otherwise they stay as
 * ordinary reservations. Past occurrences are always kept.
 */
export async function deleteFixedBooking(complexId: string, fixedBookingId: string, cancelFuture: boolean) {
  const fixedBooking = await prisma.fixedBooking.findFirst({ where: { id: fixedBookingId, complexId } });
  if (!fixedBooking) {
    throw new HttpError(404, 'Turno fijo no encontrado.');
  }

  const todayStr = formatDate(new Date());

  await prisma.$transaction(async (tx) => {
    await tx.fixedBooking.update({ where: { id: fixedBookingId }, data: { active: false } });

    if (cancelFuture) {
      const upcoming = await tx.reservation.findMany({
        where: { fixedBookingId, turn: { date: { gte: todayStr } } },
      });
      for (const r of upcoming) {
        await releaseReservationTx(tx, r, { manualOverride: false });
      }
    }
  });
}
