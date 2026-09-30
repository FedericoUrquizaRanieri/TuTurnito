import prisma from '../prisma';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { hasStarted, nowParts, today } from './clock';
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

export function fromMinutes(total: number): string {
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
 * The court's slots that fit entirely inside [startTime, endTime] — the
 * individual classes of a professor's class schedule. Compares in minutes so
 * a range ending at "24:00" works.
 */
export function slotsWithin(
  court: { openTime: string; closeTime: string; slotMinutes: number },
  startTime: string,
  endTime: string
) {
  const from = toMinutes(startTime);
  const to = toMinutes(endTime);
  return buildCourtSlots(court).filter((s) => {
    const start = toMinutes(s.start);
    return start >= from && start + court.slotMinutes <= to;
  });
}

/**
 * Materializes every active professor class schedule in the range as CLASS
 * reservations (one per turn inside the schedule's time window, on its
 * weekdays). Same rules as fixed bookings: only free turns the owner hasn't
 * touched are booked.
 */
async function applyClassSchedules(tx: Prisma.TransactionClient, complexId: string, fromDateStr: string, toDateStr: string) {
  const schedules = await tx.classSchedule.findMany({
    where: { complexId, active: true, startDate: { lte: toDateStr } },
    include: { court: true, professor: { select: { id: true, name: true, phone: true } } },
  });
  if (schedules.length === 0) return;

  const candidates = await tx.turn.findMany({
    where: {
      courtId: { in: schedules.map((s) => s.courtId) },
      date: { gte: fromDateStr, lte: toDateStr },
      state: 'AVAILABLE',
      manualOverride: false,
      reservation: null,
    },
  });

  const now = nowParts();
  for (const turn of candidates) {
    if (hasStarted(turn.date, turn.startTime, now)) continue;
    const { dayOfWeek } = parseDateString(turn.date);
    const start = toMinutes(turn.startTime);
    const schedule = schedules.find(
      (s) =>
        s.courtId === turn.courtId &&
        s.daysOfWeek.includes(dayOfWeek) &&
        s.startDate <= turn.date &&
        start >= toMinutes(s.startTime) &&
        start + s.court.slotMinutes <= toMinutes(s.endTime)
    );
    if (!schedule) continue;

    await bookTurnTx(
      tx,
      turn,
      {
        complexId,
        userId: schedule.professorId,
        guestName: `Clase - ${schedule.professor.name}`,
        guestPhone: schedule.professor.phone || '-',
        type: 'CLASS',
        professorId: schedule.professorId,
        classScheduleId: schedule.id,
        recordedById: schedule.professorId,
        paymentNote: `Clase de ${schedule.professor.name}`,
      },
      { requireNoOverride: true }
    );
  }
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

  const now = nowParts();
  for (const turn of candidates) {
    if (hasStarted(turn.date, turn.startTime, now)) continue;
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
 * the range, and books the fixed bookings and class schedules that apply.
 * Occupied turns and turns the owner edited by hand are never overwritten.
 * Past dates are only read, never generated.
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
  const todayStr = today();
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
      await applyClassSchedules(tx, complexId, genFrom, toDateStr);
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

export type ClassScheduleConflict = {
  classScheduleId: string;
  professorName: string;
  courtName: string;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
};

export type FixedBookingConflict = {
  fixedBookingId: string;
  courtName: string;
  dayOfWeek: number;
  startTime: string;
  guestName: string;
};

export type SaveCourtsResult =
  | { success: true; deactivatedFixedBookings: FixedBookingConflict[] }
  | {
      hasConflicts: true;
      conflictType: 'CLASS_SCHEDULES' | 'COURT_DELETION' | 'RANGE_CHANGE';
      conflicts: ScheduleConflict[];
      classSchedules: ClassScheduleConflict[];
      fixedBookings: FixedBookingConflict[];
    };

/**
 * Saves the courts of a complex (add / rename / delete, and each court's
 * range: opening, closing, slot length and base price).
 *
 * Every conflict is detected BEFORE any write, so a 409 leaves the data
 * untouched:
 * - A professor's class schedule whose classes would change (court deleted,
 *   or its turns inside the schedule's window move) always blocks the save:
 *   students are enrolled by class start time, so the professor has to
 *   remove or redo the schedule first.
 * - Upcoming reservations on a deleted court or outside a court's new range,
 *   and fixed bookings whose slot disappears, need `resolveConflicts`. Those
 *   fixed bookings are ended either way (their slot no longer exists).
 *
 * Deleted courts are deactivated, not removed, so their past reservations,
 * payments and the classes already charged are kept. Runs as a single
 * transaction: court changes and the turn re-sync all land together or none.
 */
export async function saveComplexCourts(complexId: string, payload: CourtsUpdatePayload): Promise<SaveCourtsResult> {
  const { courts: courtInputs, resolveConflicts } = payload;
  const now = nowParts();
  const todayStr = now.today;

  return prisma.$transaction(
    async (tx): Promise<SaveCourtsResult> => {
      const existingCourts = await tx.court.findMany({ where: { complexId, active: true } });
      const existingIds = existingCourts.map((c) => c.id);
      const existingById = new Map(existingCourts.map((c) => [c.id, c]));
      const inputById = new Map(courtInputs.filter((c) => c.id && existingById.has(c.id)).map((c) => [c.id!, c]));
      const courtsToDelete = existingCourts.filter((c) => !inputById.has(c.id));
      const deletedIds = new Set(courtsToDelete.map((c) => c.id));
      const courtName = (courtId: string) => existingById.get(courtId)?.name ?? '';
      const newStartsOf = (courtId: string) => new Set(buildCourtSlots(inputById.get(courtId)!).map((s) => s.start));

      // 1. Class schedules whose classes would change: never overridable.
      const classSchedules = await tx.classSchedule.findMany({
        where: { courtId: { in: existingIds }, active: true },
        include: { professor: { select: { name: true } } },
      });
      const classConflicts: ClassScheduleConflict[] = classSchedules
        .filter((cs) => {
          const input = inputById.get(cs.courtId);
          if (!input) return true;
          const before = slotsWithin(existingById.get(cs.courtId)!, cs.startTime, cs.endTime).map((s) => s.start).join();
          const after = slotsWithin(input, cs.startTime, cs.endTime).map((s) => s.start).join();
          return before !== after;
        })
        .map((cs) => ({
          classScheduleId: cs.id,
          professorName: cs.professor.name,
          courtName: courtName(cs.courtId),
          daysOfWeek: cs.daysOfWeek,
          startTime: cs.startTime,
          endTime: cs.endTime,
        }));
      if (classConflicts.length > 0) {
        return { hasConflicts: true, conflictType: 'CLASS_SCHEDULES', conflicts: [], classSchedules: classConflicts, fixedBookings: [] };
      }

      // 2. Upcoming reservations on deleted courts or outside the new range.
      // Those that already started took place: they're history, not conflicts.
      const futureReservations = (
        await tx.reservation.findMany({
          where: { complexId, turn: { date: { gte: todayStr }, courtId: { in: existingIds } } },
          include: { turn: { include: { court: true } } },
        })
      ).filter((r) => !hasStarted(r.turn.date, r.turn.startTime, now));

      const toConflict = (r: (typeof futureReservations)[0]): ScheduleConflict => ({
        reservationId: r.id,
        turnId: r.turnId,
        courtName: r.turn.court.name,
        date: r.turn.date,
        time: `${r.turn.startTime} - ${r.turn.endTime}`,
        guestName: r.guestName,
        type: r.type,
      });

      const deletionConflicts = futureReservations.filter((r) => deletedIds.has(r.turn.courtId)).map(toConflict);
      const rangeConflicts = futureReservations
        .filter((r) => !deletedIds.has(r.turn.courtId) && !newStartsOf(r.turn.courtId).has(r.turn.startTime))
        .map(toConflict);

      // 3. Fixed bookings whose slot disappears.
      const fixedBookings = await tx.fixedBooking.findMany({ where: { courtId: { in: existingIds }, active: true } });
      const fixedConflicts: FixedBookingConflict[] = fixedBookings
        .filter((fb) => deletedIds.has(fb.courtId) || !newStartsOf(fb.courtId).has(fb.startTime))
        .map((fb) => ({
          fixedBookingId: fb.id,
          courtName: courtName(fb.courtId),
          dayOfWeek: fb.dayOfWeek,
          startTime: fb.startTime,
          guestName: fb.guestName,
        }));

      const conflicts = [...deletionConflicts, ...rangeConflicts];
      if ((conflicts.length > 0 || fixedConflicts.length > 0) && !resolveConflicts) {
        return {
          hasConflicts: true,
          conflictType: deletionConflicts.length > 0 || rangeConflicts.length === 0 && courtsToDelete.length > 0 ? 'COURT_DELETION' : 'RANGE_CHANGE',
          conflicts,
          classSchedules: [],
          fixedBookings: fixedConflicts,
        };
      }

      if (fixedConflicts.length > 0) {
        await tx.fixedBooking.updateMany({ where: { id: { in: fixedConflicts.map((f) => f.fixedBookingId) } }, data: { active: false } });
      }

      // A deleted court can't keep upcoming reservations; out-of-range ones
      // are freed only with CANCEL (KEEP leaves them: occupied turns are never
      // deleted by the re-sync, which then removes the now-free turns).
      const toRelease = resolveConflicts === 'CANCEL' ? conflicts : deletionConflicts;
      for (const c of toRelease) {
        await releaseReservationTx(tx, { id: c.reservationId, turnId: c.turnId });
      }

      if (courtsToDelete.length > 0) {
        const ids = courtsToDelete.map((c) => c.id);
        await tx.court.updateMany({ where: { id: { in: ids } }, data: { active: false } });
        // Its upcoming free turns go away; past ones stay with their reservations.
        await tx.turn.deleteMany({ where: { courtId: { in: ids }, date: { gte: todayStr }, reservation: null } });
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
        if (c.id && inputById.has(c.id)) {
          await tx.court.update({ where: { id: c.id }, data });
        } else {
          await tx.court.create({ data: { ...data, complexId } });
        }
      }

      // Re-sync future turns (next 60 days), inside this same transaction
      await ensureTurnsForRange(complexId, todayStr, addDays(todayStr, 60), tx);

      return { success: true, deactivatedFixedBookings: fixedConflicts };
    },
    { maxWait: 5000, timeout: 20000 }
  );
}
