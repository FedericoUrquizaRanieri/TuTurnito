import prisma from '../prisma';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { bookTurnTx, releaseReservationTx } from './booking';

// Either the top-level PrismaClient or an interactive-transaction client
// (`tx` from an outer `prisma.$transaction`). Functions that accept this
// use whichever one they're given instead of hardcoding `prisma`, so they
// can run standalone OR be composed inside a larger transaction.
type DbClient = typeof prisma | Prisma.TransactionClient;

function isP2002(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

// Validation lives here, next to the types it defines, instead of being
// hand-duplicated in schedules.routes.ts — the payload shape only has one
// source of truth this way. schedules.routes.ts imports these schemas and
// runs them through the shared `validate()` middleware.
export const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
// Closing time may also be "24:00" (midnight at the end of the day).
const CLOSE_TIME_REGEX = /^(([01]\d|2[0-3]):[0-5]\d|24:00)$/;

export const courtInputSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().min(1, 'El nombre de la cancha es requerido'),
    order: z.number().int().nonnegative().optional(),
    openTime: z.string().regex(TIME_REGEX, 'La hora de apertura debe tener formato HH:MM'),
    closeTime: z.string().regex(CLOSE_TIME_REGEX, 'La hora de cierre debe tener formato HH:MM'),
    slotMinutes: z
      .number()
      .int()
      .min(30, 'La duración del turno debe ser de al menos 30 minutos')
      .max(180, 'La duración del turno no puede superar los 180 minutos'),
    basePrice: z.number().nonnegative('El precio no puede ser negativo'),
  })
  .refine((c) => toMinutes(c.closeTime) - toMinutes(c.openTime) >= c.slotMinutes, {
    message: 'El rango horario de la cancha debe alcanzar para al menos un turno completo',
    path: ['closeTime'],
  });

export const courtsUpdateSchema = z.object({
  courts: z.array(courtInputSchema).min(1, 'Debes mantener al menos una cancha'),
  resolveConflicts: z.enum(['KEEP', 'CANCEL']).optional(),
});

export type CourtInput = z.infer<typeof courtInputSchema>;
export type CourtsUpdatePayload = z.infer<typeof courtsUpdateSchema>;

// Helper: parse date string YYYY-MM-DD to local Date components
export function parseDateString(dateStr: string): { year: number; month: number; day: number; dayOfWeek: number } {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return {
    year,
    month,
    day,
    dayOfWeek: d.getDay(),
  };
}

// Helper: format Date object to YYYY-MM-DD
export function formatDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper: YYYY-MM-DD shifted by N days
export function addDays(dateStr: string, days: number): string {
  const { year, month, day } = parseDateString(dateStr);
  return formatDate(new Date(year, month - 1, day + days));
}

// Helper: generate array of date strings between from and to (inclusive)
export function getDateRange(fromStr: string, toStr: string): string[] {
  const dates: string[] = [];
  const [fromY, fromM, fromD] = fromStr.split('-').map(Number);
  const [toY, toM, toD] = toStr.split('-').map(Number);

  const current = new Date(fromY, fromM - 1, fromD);
  const end = new Date(toY, toM - 1, toD);

  while (current <= end) {
    dates.push(formatDate(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function fromMinutes(total: number): string {
  const wrapped = total % (24 * 60);
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

/** The turn slots a court offers every day, from its opening to closing time in `slotMinutes` blocks (the last one must fit entirely). */
export function buildCourtSlots(court: { openTime: string; closeTime: string; slotMinutes: number }) {
  const slots: { start: string; end: string }[] = [];
  const close = toMinutes(court.closeTime);
  if (court.slotMinutes <= 0) return slots;
  for (let m = toMinutes(court.openTime); m + court.slotMinutes <= close; m += court.slotMinutes) {
    slots.push({ start: fromMinutes(m), end: fromMinutes(m + court.slotMinutes) });
  }
  return slots;
}

/**
 * Materializes the turns of every fixed booking (turno fijo) that applies in
 * the range as real reservations. Only books turns that are still AVAILABLE
 * and untouched by the owner (`manualOverride`), so a blocked slot, a
 * tournament, a player's booking or a cancelled occurrence is never
 * overwritten.
 */
async function applyFixedBookings(tx: Prisma.TransactionClient, complexId: string, fromDateStr: string, toDateStr: string) {
  const fixedBookings = await tx.fixedBooking.findMany({
    where: {
      complexId,
      active: true,
      startDate: { lte: toDateStr },
      OR: [{ endDate: null }, { endDate: { gte: fromDateStr } }],
    },
  });
  if (fixedBookings.length === 0) return;

  const complex = await tx.complex.findUnique({ where: { id: complexId }, select: { ownerId: true } });
  if (!complex) return;

  const candidates = await tx.turn.findMany({
    where: {
      courtId: { in: fixedBookings.map((fb) => fb.courtId) },
      startTime: { in: fixedBookings.map((fb) => fb.startTime) },
      date: { gte: fromDateStr, lte: toDateStr },
      state: 'AVAILABLE',
      manualOverride: false,
      reservation: null,
    },
  });

  for (const turn of candidates) {
    const { dayOfWeek } = parseDateString(turn.date);
    const fb = fixedBookings.find(
      (f) =>
        f.courtId === turn.courtId &&
        f.startTime === turn.startTime &&
        f.dayOfWeek === dayOfWeek &&
        f.startDate <= turn.date &&
        (!f.endDate || f.endDate >= turn.date)
    );
    if (!fb) continue;

    await bookTurnTx(
      tx,
      turn,
      {
        complexId,
        userId: null,
        guestName: fb.guestName,
        guestPhone: fb.guestPhone,
        type: 'PLAYER',
        notes: fb.notes,
        fixedBookingId: fb.id,
        recordedById: complex.ownerId,
        paymentNote: `Turno fijo de ${fb.guestName}`,
      },
      { requireNoOverride: true }
    );
  }
}

/**
 * Ensures turns are materialized for the given complex in the date range.
 * Idempotent: creates missing turns from each court's range, re-syncs
 * untouched free turns (price/end time), removes free turns that fell out of
 * the range, and books the fixed bookings that apply. Occupied turns and
 * turns the owner edited by hand are never overwritten. Past dates are only
 * read, never generated.
 *
 * Accepts an optional `client` so it can be composed inside an outer
 * transaction (e.g. from `saveComplexCourts`). When called standalone
 * (the default, `client = prisma`), its own writes are wrapped in a
 * transaction here.
 */
export async function ensureTurnsForRange(
  complexId: string,
  fromDateStr: string,
  toDateStr: string,
  client: DbClient = prisma
) {
  const courts = await client.court.findMany({
    where: { complexId, active: true },
  });

  if (courts.length === 0) {
    return [];
  }

  const courtIds = courts.map((c) => c.id);
  const todayStr = formatDate(new Date());
  const genFrom = fromDateStr > todayStr ? fromDateStr : todayStr;

  if (genFrom <= toDateStr) {
    const dates = getDateRange(genFrom, toDateStr);

    // Fetch existing turns in the generated part of the range
    const existingTurns = await client.turn.findMany({
      where: {
        courtId: { in: courtIds },
        date: { gte: genFrom, lte: toDateStr },
      },
    });

    const existingMap = new Map<string, typeof existingTurns[0]>();
    for (const t of existingTurns) {
      existingMap.set(`${t.courtId}_${t.date}_${t.startTime}`, t);
    }

    const toCreate: { courtId: string; date: string; startTime: string; endTime: string; price: number }[] = [];
    const toUpdate: { id: string; price: number; endTime: string }[] = [];
    const validKeys = new Set<string>();

    for (const dateStr of dates) {
      for (const court of courts) {
        for (const slot of buildCourtSlots(court)) {
          const key = `${court.id}_${dateStr}_${slot.start}`;
          validKeys.add(key);
          const existing = existingMap.get(key);

          if (!existing) {
            toCreate.push({
              courtId: court.id,
              date: dateStr,
              startTime: slot.start,
              endTime: slot.end,
              price: court.basePrice,
            });
          } else if (
            existing.state !== 'OCCUPIED' &&
            !existing.manualOverride &&
            (existing.price !== court.basePrice || existing.endTime !== slot.end)
          ) {
            toUpdate.push({ id: existing.id, price: court.basePrice, endTime: slot.end });
          }
        }
      }
    }

    // Free turns whose start no longer exists in the court's range.
    const toDelete = existingTurns
      .filter((t) => t.state !== 'OCCUPIED' && !validKeys.has(`${t.courtId}_${t.date}_${t.startTime}`))
      .map((t) => t.id);

    // A concurrent request may have already created some of these same
    // turns between our read above and this write — that's expected under
    // concurrency, not an error, so the unique-constraint violation (P2002)
    // is swallowed and the final findMany below is what actually gets
    // returned to the caller either way.
    const writeTurns = async (tx: Prisma.TransactionClient) => {
      if (toCreate.length > 0) {
        await tx.turn.createMany({ data: toCreate, skipDuplicates: true });
      }

      for (const u of toUpdate) {
        // Guarded so a turn reserved/edited concurrently is left alone.
        await tx.turn.updateMany({
          where: { id: u.id, state: { not: 'OCCUPIED' }, manualOverride: false },
          data: { price: u.price, endTime: u.endTime },
        });
      }

      if (toDelete.length > 0) {
        await tx.turn.deleteMany({ where: { id: { in: toDelete }, state: { not: 'OCCUPIED' } } });
      }

      await applyFixedBookings(tx, complexId, genFrom, toDateStr);
    };

    if (client === prisma) {
      // Standalone call: give our own writes transactional atomicity.
      try {
        await prisma.$transaction((tx) => writeTurns(tx), { maxWait: 5000, timeout: 20000 });
      } catch (error) {
        if (!isP2002(error)) throw error;
      }
    } else {
      // Already running inside an outer transaction (e.g. saveComplexCourts).
      await writeTurns(client as Prisma.TransactionClient);
    }
  }

  // Return all turns in range with reservations and court info
  return client.turn.findMany({
    where: {
      courtId: { in: courtIds },
      date: { gte: fromDateStr, lte: toDateStr },
    },
    include: {
      court: true,
      reservation: {
        include: {
          user: { select: { id: true, name: true, email: true, phone: true } },
          professor: { select: { id: true, name: true, email: true } },
        },
      },
    },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }, { court: { order: 'asc' } }],
  });
}

type ScheduleConflict = {
  reservationId: string;
  turnId: string;
  courtName: string;
  date: string;
  time: string;
  guestName: string;
  type: string;
};

/**
 * Saves the courts of a complex (add / rename / delete, and each court's
 * range: opening, closing, slot length and base price).
 *
 * Every conflict (future reservations on a deleted court, or outside a
 * court's new range) is detected BEFORE any write, so a 409 leaves the data
 * untouched. Runs as a single transaction: court changes and the turn
 * re-sync either all land together or none do.
 */
export async function saveComplexCourts(complexId: string, payload: CourtsUpdatePayload) {
  const { courts: courtInputs, resolveConflicts } = payload;
  const todayStr = formatDate(new Date());

  return prisma.$transaction(
    async (tx) => {
      const existingCourts = await tx.court.findMany({ where: { complexId } });
      const existingIds = new Set(existingCourts.map((c) => c.id));
      const inputIds = courtInputs.map((c) => c.id).filter((id): id is string => Boolean(id) && existingIds.has(id!));
      const courtsToDelete = existingCourts.filter((c) => !inputIds.includes(c.id));

      const futureReservations = await tx.reservation.findMany({
        where: {
          complexId,
          turn: { date: { gte: todayStr }, courtId: { in: existingCourts.map((c) => c.id) } },
        },
        include: { turn: { include: { court: true } } },
      });

      const toConflict = (r: (typeof futureReservations)[0]): ScheduleConflict => ({
        reservationId: r.id,
        turnId: r.turnId,
        courtName: r.turn.court.name,
        date: r.turn.date,
        time: `${r.turn.startTime} - ${r.turn.endTime}`,
        guestName: r.guestName,
        type: r.type,
      });

      // 1. Reservations on courts being deleted
      const deletedIds = new Set(courtsToDelete.map((c) => c.id));
      const deletionConflicts = futureReservations.filter((r) => deletedIds.has(r.turn.courtId)).map(toConflict);

      // 2. Reservations whose start falls outside the court's new range
      const rangeConflicts: ScheduleConflict[] = [];
      for (const input of courtInputs) {
        if (!input.id || !existingIds.has(input.id)) continue;
        const newStarts = new Set(buildCourtSlots(input).map((s) => s.start));
        for (const r of futureReservations) {
          if (r.turn.courtId === input.id && !newStarts.has(r.turn.startTime)) {
            rangeConflicts.push(toConflict(r));
          }
        }
      }

      const conflicts = [...deletionConflicts, ...rangeConflicts];
      if (conflicts.length > 0 && !resolveConflicts) {
        return {
          hasConflicts: true,
          conflictType: deletionConflicts.length > 0 ? 'COURT_DELETION' : 'RANGE_CHANGE',
          conflicts,
        };
      }

      // Deleted courts cascade-delete their turns and reservations either
      // way; drop their payments too so they don't linger as orphans.
      if (deletionConflicts.length > 0) {
        await tx.payment.deleteMany({
          where: { payableType: 'RESERVATION', payableId: { in: deletionConflicts.map((c) => c.reservationId) } },
        });
      }

      // KEEP leaves out-of-range reservations in place (occupied turns are
      // never deleted by the re-sync); CANCEL frees them, and the re-sync
      // below then removes the now-free out-of-range turns.
      if (resolveConflicts === 'CANCEL') {
        for (const c of rangeConflicts) {
          await releaseReservationTx(tx, { id: c.reservationId, turnId: c.turnId });
        }
      }

      if (courtsToDelete.length > 0) {
        await tx.court.deleteMany({ where: { id: { in: courtsToDelete.map((c) => c.id) } } });
      }

      for (let i = 0; i < courtInputs.length; i++) {
        const c = courtInputs[i];
        const data = {
          name: c.name,
          order: c.order ?? i,
          active: true,
          openTime: c.openTime,
          closeTime: c.closeTime,
          slotMinutes: c.slotMinutes,
          basePrice: c.basePrice,
        };
        if (c.id && existingIds.has(c.id)) {
          await tx.court.update({ where: { id: c.id }, data });
        } else {
          await tx.court.create({ data: { ...data, complexId } });
        }
      }

      // Re-sync future turns (next 60 days), inside this same transaction
      await ensureTurnsForRange(complexId, todayStr, addDays(todayStr, 60), tx);

      return { success: true };
    },
    { maxWait: 5000, timeout: 20000 }
  );
}
