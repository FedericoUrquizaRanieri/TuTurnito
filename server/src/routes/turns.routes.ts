import { Router, Request, Response } from 'express';
import { ensureTurnsForRange, formatDate } from '../services/schedule.service';
import { asyncHandler } from '../middleware/asyncHandler';
import { HttpError } from '../middleware/HttpError';

const router = Router();

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 90;

// GET /api/complexes/:id/turns?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get(
  '/:id/turns',
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const { from, to } = req.query;

    const todayStr = formatDate(new Date());

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
    return res.json({ turns });
  }, 'Error al obtener los turnos del complejo.')
);

export default router;
