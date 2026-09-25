import prisma from '../prisma';
import { Prisma, TurnState } from '@prisma/client';
import * as XLSX from 'xlsx';
import { z } from 'zod';

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
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export const gridCellSchema = z.object({
  courtId: z.string().min(1, 'Cada celda necesita el id de una cancha'),
  dayOfWeek: z.number().int().min(0, 'El día debe estar entre 0 y 6').max(6, 'El día debe estar entre 0 y 6'),
  startTime: z.string().regex(TIME_REGEX, 'La hora de inicio debe tener formato HH:MM'),
  endTime: z.string().regex(TIME_REGEX, 'La hora de fin debe tener formato HH:MM'),
  price: z.number().nonnegative('El precio no puede ser negativo'),
  availability: z.enum(['AVAILABLE', 'BLOCKED']),
});

export const courtInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'El nombre de la cancha es requerido'),
  order: z.number().int().nonnegative().optional(),
});

export const scheduleUpdateSchema = z.object({
  courts: z.array(courtInputSchema).optional(),
  cells: z.array(gridCellSchema),
  resolveConflicts: z.enum(['KEEP', 'CANCEL']).optional(),
});

export type GridCellInput = z.infer<typeof gridCellSchema>;
export type CourtInput = z.infer<typeof courtInputSchema>;
export type ScheduleUpdatePayload = z.infer<typeof scheduleUpdateSchema>;

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

/**
 * Ensures turns are materialized for the given complex in the date range.
 * Idempotent: creates missing turns, updates unreserved turn prices/availability from template, never overwrites occupied turns.
 *
 * Accepts an optional `client` so it can be composed inside an outer
 * transaction (e.g. from `saveComplexSchedule`). When called standalone
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
    include: { templateCells: true },
  });

  if (courts.length === 0) {
    return [];
  }

  const dates = getDateRange(fromDateStr, toDateStr);
  const courtIds = courts.map((c) => c.id);

  // Fetch existing turns in range
  const existingTurns = await client.turn.findMany({
    where: {
      courtId: { in: courtIds },
      date: { gte: fromDateStr, lte: toDateStr },
    },
    include: { reservation: true },
  });

  const existingMap = new Map<string, typeof existingTurns[0]>();
  for (const t of existingTurns) {
    existingMap.set(`${t.courtId}_${t.date}_${t.startTime}`, t);
  }

  const toCreate: {
    courtId: string;
    date: string;
    startTime: string;
    endTime: string;
    price: number;
    state: TurnState;
  }[] = [];

  const toUpdate: { id: string; price: number; state: TurnState; endTime: string }[] = [];

  for (const dateStr of dates) {
    const { dayOfWeek } = parseDateString(dateStr);

    for (const court of courts) {
      const templatesForDay = court.templateCells.filter((tc) => tc.dayOfWeek === dayOfWeek);

      for (const tc of templatesForDay) {
        const key = `${court.id}_${dateStr}_${tc.startTime}`;
        const existing = existingMap.get(key);

        if (!existing) {
          toCreate.push({
            courtId: court.id,
            date: dateStr,
            startTime: tc.startTime,
            endTime: tc.endTime,
            price: tc.price,
            state: tc.availability, // "AVAILABLE" or "BLOCKED"
          });
        } else if (existing.state !== 'OCCUPIED') {
          // If template changed price or availability and turn is not occupied, sync it
          if (existing.price !== tc.price || existing.state !== tc.availability || existing.endTime !== tc.endTime) {
            toUpdate.push({
              id: existing.id,
              price: tc.price,
              state: tc.availability,
              endTime: tc.endTime,
            });
          }
        }
      }
    }
  }

  // Execute in batches. SQLite's Prisma connector doesn't support
  // `skipDuplicates` on createMany, so instead we catch the unique-constraint
  // violation (P2002) that happens when a concurrent request already
  // created some of these same turns between our read above and this write
  // — that's expected under concurrency, not an error, and the final
  // findMany below is what actually gets returned to the caller either way.
  const writeTurns = async (tx: DbClient) => {
    if (toCreate.length > 0) {
      try {
        await tx.turn.createMany({ data: toCreate });
      } catch (error) {
        if (!isP2002(error)) throw error;
      }
    }

    for (const u of toUpdate) {
      try {
        await tx.turn.update({
          where: { id: u.id },
          data: {
            price: u.price,
            state: u.state,
            endTime: u.endTime,
          },
        });
      } catch (error) {
        // The turn may have just been reserved (state flipped to OCCUPIED)
        // or deleted concurrently; skip it, it's no longer ours to sync.
        if (!(error instanceof Prisma.PrismaClientKnownRequestError)) throw error;
      }
    }
  };

  if (client === prisma) {
    // Standalone call: give our own writes transactional atomicity.
    await prisma.$transaction((tx) => writeTurns(tx));
  } else {
    // Already running inside an outer transaction (e.g. saveComplexSchedule).
    await writeTurns(client);
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

/**
 * Validates and saves the weekly schedule grid for a complex.
 *
 * Runs as a single transaction: court upserts/deletes, template-cell
 * replacement and turn re-sync either all land together or none do, so a
 * failure partway through can't leave the grid in a half-saved state.
 */
export async function saveComplexSchedule(
  complexId: string,
  payload: ScheduleUpdatePayload
) {
  const { courts: courtInputs, cells, resolveConflicts } = payload;
  const todayStr = formatDate(new Date());

  return prisma.$transaction(
    async (tx) => {
      // 1. Handle court updates / additions / removals if provided
      if (courtInputs && courtInputs.length > 0) {
        const existingCourts = await tx.court.findMany({
          where: { complexId },
        });

        const inputIds = courtInputs.map((c) => c.id).filter(Boolean) as string[];
        const courtsToDelete = existingCourts.filter((c) => !inputIds.includes(c.id));

        // Check if courts to delete have future reservations
        if (courtsToDelete.length > 0) {
          const futureReservationsOnDeletedCourts = await tx.reservation.findMany({
            where: {
              turn: {
                courtId: { in: courtsToDelete.map((c) => c.id) },
                date: { gte: todayStr },
              },
            },
            include: { turn: { include: { court: true } } },
          });

          if (futureReservationsOnDeletedCourts.length > 0 && !resolveConflicts) {
            return {
              hasConflicts: true,
              conflictType: 'COURT_DELETION',
              conflicts: futureReservationsOnDeletedCourts.map((r) => ({
                reservationId: r.id,
                courtName: r.turn.court.name,
                date: r.turn.date,
                time: `${r.turn.startTime} - ${r.turn.endTime}`,
                guestName: r.guestName,
                type: r.type,
              })),
            };
          }

          if (resolveConflicts === 'CANCEL') {
            for (const r of futureReservationsOnDeletedCourts) {
              await tx.reservation.delete({ where: { id: r.id } });
            }
          }

          // Delete/deactivate removed courts
          await tx.court.deleteMany({
            where: { id: { in: courtsToDelete.map((c) => c.id) } },
          });
        }

        // Upsert courts
        for (let i = 0; i < courtInputs.length; i++) {
          const c = courtInputs[i];
          if (c.id && !c.id.startsWith('temp-')) {
            await tx.court.update({
              where: { id: c.id },
              data: { name: c.name, order: c.order ?? i, active: true },
            });
          } else {
            await tx.court.create({
              data: {
                complexId,
                name: c.name,
                order: c.order ?? i,
                active: true,
              },
            });
          }
        }
      }

      // 2. Fetch fresh active courts
      const activeCourts = await tx.court.findMany({
        where: { complexId, active: true },
      });
      const activeCourtIds = activeCourts.map((c) => c.id);

      // 3. Conflict detection on modified/blocked cells
      const blockedCells = cells.filter((cell) => cell.availability === 'BLOCKED');
      if (blockedCells.length > 0) {
        const futureOccupiedTurns = await tx.turn.findMany({
          where: {
            courtId: { in: activeCourtIds },
            date: { gte: todayStr },
            state: 'OCCUPIED',
          },
          include: {
            court: true,
            reservation: true,
          },
        });

        const conflictingReservations: Array<{
          reservationId: string;
          turnId: string;
          courtName: string;
          date: string;
          time: string;
          guestName: string;
          type: string;
        }> = [];

        for (const turn of futureOccupiedTurns) {
          const { dayOfWeek } = parseDateString(turn.date);
          const isBlocked = blockedCells.some(
            (bc) => bc.courtId === turn.courtId && bc.dayOfWeek === dayOfWeek && bc.startTime === turn.startTime
          );
          if (isBlocked && turn.reservation) {
            conflictingReservations.push({
              reservationId: turn.reservation.id,
              turnId: turn.id,
              courtName: turn.court.name,
              date: turn.date,
              time: `${turn.startTime} - ${turn.endTime}`,
              guestName: turn.reservation.guestName,
              type: turn.reservation.type,
            });
          }
        }

        if (conflictingReservations.length > 0 && !resolveConflicts) {
          return {
            hasConflicts: true,
            conflictType: 'CELL_BLOCKED',
            conflicts: conflictingReservations,
          };
        }

        if (conflictingReservations.length > 0 && resolveConflicts === 'CANCEL') {
          for (const cr of conflictingReservations) {
            await tx.reservation.delete({ where: { id: cr.reservationId } });
            // Deleting the reservation alone leaves Turn.state stuck on
            // 'OCCUPIED' (nothing else clears it); ensureTurnsForRange below
            // skips OCCUPIED turns on purpose, so without this reset the
            // turn would stay a reservation-less ghost instead of picking
            // up the new BLOCKED template.
            await tx.turn.update({ where: { id: cr.turnId }, data: { state: 'AVAILABLE' } });
          }
        }
      }

      // 4. Replace template cells for active courts
      await tx.templateCell.deleteMany({
        where: { courtId: { in: activeCourtIds } },
      });

      const validCellsToInsert = cells
        .filter((c) => activeCourtIds.includes(c.courtId))
        .map((c) => ({
          courtId: c.courtId,
          dayOfWeek: c.dayOfWeek,
          startTime: c.startTime,
          endTime: c.endTime,
          price: c.price,
          availability: c.availability,
        }));

      if (validCellsToInsert.length > 0) {
        await tx.templateCell.createMany({
          data: validCellsToInsert,
        });
      }

      // 5. Synchronize future turns (next 60 days), inside this same transaction
      const futureEnd = new Date();
      futureEnd.setDate(futureEnd.getDate() + 60);
      const futureEndStr = formatDate(futureEnd);
      await ensureTurnsForRange(complexId, todayStr, futureEndStr, tx);

      return { success: true };
    },
    { maxWait: 5000, timeout: 20000 }
  );
}

/**
 * Exports weekly template grid to XLSX workbook buffer.
 */
export async function exportScheduleToExcel(complexId: string): Promise<Buffer> {
  const courts = await prisma.court.findMany({
    where: { complexId, active: true },
    include: { templateCells: true },
    orderBy: { order: 'asc' },
  });

  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const rows: Array<Record<string, any>> = [];

  for (const court of courts) {
    for (const cell of court.templateCells) {
      rows.push({
        Cancha: court.name,
        Día: days[cell.dayOfWeek],
        'Día Nro (0-6)': cell.dayOfWeek,
        'Hora Inicio': cell.startTime,
        'Hora Fin': cell.endTime,
        Precio: cell.price,
        Estado: cell.availability === 'AVAILABLE' ? 'DISPONIBLE' : 'BLOQUEADO',
      });
    }
  }

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Grilla Semanal');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * Imports weekly schedule from XLSX buffer.
 */
export async function importScheduleFromExcel(complexId: string, fileBuffer: Buffer) {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('El archivo Excel no contiene hojas válidas.');
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<any>(sheet);

  if (!rows || rows.length === 0) {
    throw new Error('El archivo Excel está vacío.');
  }

  // Validate columns
  const firstRow = rows[0];
  if (!('Cancha' in firstRow && 'Hora Inicio' in firstRow && 'Precio' in firstRow)) {
    throw new Error('Formato inválido. Las columnas deben incluir Cancha, Hora Inicio, Hora Fin, Precio y Estado.');
  }

  // Ensure courts exist or create them
  const courtNames = Array.from(new Set(rows.map((r) => String(r.Cancha).trim())));
  const existingCourts = await prisma.court.findMany({
    where: { complexId },
  });

  const courtMap = new Map<string, string>();
  for (const name of courtNames) {
    let court = existingCourts.find((ec) => ec.name.toLowerCase() === name.toLowerCase());
    if (!court) {
      court = await prisma.court.create({
        data: {
          complexId,
          name,
          order: existingCourts.length,
        },
      });
    }
    courtMap.set(name.toLowerCase(), court.id);
  }

  const dayMap: Record<string, number> = {
    domingo: 0,
    lunes: 1,
    martes: 2,
    miercoles: 3,
    miércoles: 3,
    jueves: 4,
    viernes: 5,
    sabado: 6,
    sábado: 6,
  };

  const parsedCells: GridCellInput[] = [];
  const errors: string[] = [];

  rows.forEach((r, idx) => {
    const rowNum = idx + 2; // +1 for the header row, +1 to make it 1-based

    const cName = String(r.Cancha || '').trim();
    if (!cName) {
      errors.push(`Fila ${rowNum}: falta el nombre de la cancha.`);
      return;
    }
    const courtId = courtMap.get(cName.toLowerCase());
    if (!courtId) {
      errors.push(`Fila ${rowNum}: no se pudo resolver la cancha "${cName}".`);
      return;
    }

    let dayOfWeek = Number(r['Día Nro (0-6)']);
    if (isNaN(dayOfWeek)) {
      const dName = String(r.Día || '').trim().toLowerCase();
      if (!(dName in dayMap)) {
        errors.push(`Fila ${rowNum}: día inválido ("${r.Día ?? ''}").`);
        return;
      }
      dayOfWeek = dayMap[dName];
    }
    if (dayOfWeek < 0 || dayOfWeek > 6) {
      errors.push(`Fila ${rowNum}: el día debe estar entre 0 y 6.`);
      return;
    }

    const startTime = String(r['Hora Inicio'] || '').trim();
    if (!startTime) {
      errors.push(`Fila ${rowNum}: falta la hora de inicio.`);
      return;
    }
    const endTime = String(r['Hora Fin'] || '').trim() || startTime;

    const rawPrice = r.Precio;
    const price = Number(rawPrice);
    if (rawPrice === undefined || rawPrice === null || rawPrice === '' || Number.isNaN(price) || price < 0) {
      errors.push(`Fila ${rowNum}: precio inválido ("${rawPrice ?? ''}").`);
      return;
    }

    const estadoStr = String(r.Estado || '').trim().toUpperCase();
    const availability = estadoStr.includes('BLOQ') ? 'BLOCKED' : 'AVAILABLE';

    parsedCells.push({
      courtId,
      dayOfWeek,
      startTime,
      endTime,
      price,
      availability,
    });
  });

  if (errors.length > 0) {
    const preview = errors.slice(0, 10).join('\n');
    const rest = errors.length > 10 ? `\n...y ${errors.length - 10} error(es) más.` : '';
    throw new Error(`El archivo tiene datos inválidos y no fue importado:\n${preview}${rest}`);
  }

  return saveComplexSchedule(complexId, {
    cells: parsedCells,
    resolveConflicts: 'KEEP',
  });
}
