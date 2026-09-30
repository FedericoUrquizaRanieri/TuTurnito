import { Router, Request, Response } from 'express';
import { ensureTurnsForRange } from '../services/schedule.service';
import { today } from '../services/clock';
import { asyncHandler } from '../middleware/asyncHandler';
import { HttpError } from '../middleware/HttpError';

const router = Router();

type GeneratedTurn = Awaited<ReturnType<typeof ensureTurnsForRange>>[number];

/**
 * What anyone (no login) may see of a turn: availability, price and whether
 * it's a class. Never who booked it (name, phone, email, notes) nor internal
 * flags — the owner's grid (/owner-turns) is where those live.
 */
export function toPublicTurn(t: GeneratedTurn) {
  return {
    id: t.id,
    courtId: t.courtId,
    date: t.date,
    startTime: t.startTime,
    endTime: t.endTime,
    price: t.price,
    state: t.state,
    label: t.label,
    court: { id: t.court.id, name: t.court.name, basePrice: t.court.basePrice },
    reservation: t.reservation ? { type: t.reservation.type } : null,
  };
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 90;

// GET /api/complexes/:id/turns?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get(
  '/:id/turns',
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const { from, to } = req.query;

    const todayStr = today();

    if (from !== undefined && (typeof from !== 'string' || !DATE_REGEX.test(from))) {
      throw new HttpError(400, 'El parámetro "from" debe tener formato YYYY-MM-DD.');
    }
    if (to !== undefined && (typeof to !== 'string' || !DATE_REGEX.test(to))) {
      throw new HttpError(400, 'El parámetro "to" debe tener formato YYYY-MM-DD.');
    }

    const fromDateStr = (from as string) || todayStr;
    const toDateStr = (to as string) || fromDateStr;

    if (toDateStr < fromDateStr) {
      throw new HttpError(400, 'El parámetro "to" no puede ser anterior a "from".');
    }

    const rangeDays = (new Date(toDateStr).getTime() - new Date(fromDateStr).getTime()) / (1000 * 60 * 60 * 24);
    if (rangeDays > MAX_RANGE_DAYS) {
      throw new HttpError(400, `El rango de fechas no puede superar los ${MAX_RANGE_DAYS} días.`);
    }

    const turns = await ensureTurnsForRange(id, fromDateStr, toDateStr);
    return res.json({ turns: turns.map(toPublicTurn) });
  }, 'Error al obtener los turnos del complejo.')
);

export default router;
