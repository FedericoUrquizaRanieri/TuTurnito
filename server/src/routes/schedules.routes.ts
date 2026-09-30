import { Router, Request, Response } from 'express';
import prisma from '../prisma';
import { requireAuth, requireRole, requireComplexOwner } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../middleware/asyncHandler';
import { HttpError } from '../middleware/HttpError';
import { saveComplexCourts, courtsUpdateSchema, ensureTurnsForRange } from '../services/schedule.service';
import { updateTurnByOwner, turnOwnerUpdateSchema } from '../services/turn.service';
import {
  listFixedBookings,
  createFixedBooking,
  deleteFixedBooking,
  fixedBookingCreateSchema,
} from '../services/fixedBooking.service';
import { buildPaymentMap, getPaymentsByPayableIds } from '../services/payment.service';
import { getComplexAnalytics } from '../services/analytics.service';
import { listPriceRules, savePriceRules, priceRulesUpdateSchema } from '../services/priceRule.service';
import { listClosures, createClosure, deleteClosure, closureCreateSchema } from '../services/closure.service';

const router = Router({ mergeParams: true });

const ownerOnly = [requireAuth, requireRole('DUEÑO'), requireComplexOwner];

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MAX_OWNER_RANGE_DAYS = 45;
const MAX_ANALYTICS_RANGE_DAYS = 366;

// GET /api/complexes/:id/schedule (Owner: courts with their range + active fixed bookings)
router.get(
  '/:id/schedule',
  ...ownerOnly,
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;

    const courts = await prisma.court.findMany({
      where: { complexId: id, active: true },
      orderBy: { order: 'asc' },
    });
    const fixedBookings = await listFixedBookings(id);

    return res.json({ courts, fixedBookings });
  }, 'Error al obtener las canchas del complejo.')
);

// PUT /api/complexes/:id/courts (Save courts and their ranges, with conflict check)
router.put(
  '/:id/courts',
  ...ownerOnly,
  validate(courtsUpdateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const result = await saveComplexCourts(id, req.body);

    if ('hasConflicts' in result) {
      return res.status(409).json({
        message:
          result.conflictType === 'CLASS_SCHEDULES'
            ? 'Hay horarios de clases de profesores en los turnos que cambian. El profesor tiene que quitarlos antes de modificar la cancha.'
            : 'Existen reservas futuras o turnos fijos afectados por estos cambios.',
        hasConflicts: true,
        conflictType: result.conflictType,
        conflicts: result.conflicts,
        classSchedules: result.classSchedules,
        fixedBookings: result.fixedBookings,
      });
    }

    return res.json({
      message: 'Canchas guardadas y turnos actualizados exitosamente.',
      success: true,
      deactivatedFixedBookings: result.deactivatedFixedBookings,
    });
  }, 'Error al guardar las canchas.')
);

// GET /api/complexes/:id/owner-turns?from&to (Owner reservations grid, past days included)
router.get(
  '/:id/owner-turns',
  ...ownerOnly,
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const { from, to } = req.query;

    if (typeof from !== 'string' || !DATE_REGEX.test(from) || typeof to !== 'string' || !DATE_REGEX.test(to)) {
      throw new HttpError(400, 'Los parámetros "from" y "to" deben tener formato YYYY-MM-DD.');
    }
    if (to < from) {
      throw new HttpError(400, 'El parámetro "to" no puede ser anterior a "from".');
    }
    const rangeDays = (new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24);
    if (rangeDays > MAX_OWNER_RANGE_DAYS) {
      throw new HttpError(400, `El rango de fechas no puede superar los ${MAX_OWNER_RANGE_DAYS} días.`);
    }

    const turns = await ensureTurnsForRange(id, from, to);
    const reservationIds = turns.flatMap((t) => (t.reservation ? [t.reservation.id] : []));
    const paymentMap = buildPaymentMap(await getPaymentsByPayableIds('RESERVATION', reservationIds));
    const openMatches = await prisma.openMatch.findMany({
      where: { reservationId: { in: reservationIds } },
      include: { players: { include: { user: { select: { name: true, phone: true } } }, orderBy: { joinedAt: 'asc' } } },
    });
    const matchByReservation = new Map(openMatches.map((m) => [m.reservationId, m]));

    const courts = await prisma.court.findMany({
      where: { complexId: id, active: true },
      orderBy: { order: 'asc' },
    });

    return res.json({
      courts,
      turns: turns.map((t) => {
        if (!t.reservation) return t;
        const p = paymentMap.get(t.reservation.id);
        return {
          ...t,
          reservation: {
            ...t.reservation,
            paymentStatus: p?.status || 'PENDING',
            paymentAmount: p ? p.amount : t.price,
            paymentId: p?.id,
            openMatch: (() => {
              const m = matchByReservation.get(t.reservation.id);
              return m
                ? { spots: m.spots, joinedCount: m.joinedCount, category: m.category, players: m.players.map((pl) => pl.user) }
                : null;
            })(),
          },
        };
      }),
    });
  }, 'Error al obtener la grilla de reservas.')
);

// PATCH /api/complexes/:id/turns/:turnId (Owner: block / tournament / free / price)
router.patch(
  '/:id/turns/:turnId',
  ...ownerOnly,
  validate(turnOwnerUpdateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const turn = await updateTurnByOwner(req.params.id as string, req.params.turnId as string, req.body);
    return res.json({ message: 'Turno actualizado.', turn });
  }, 'Error al actualizar el turno.')
);

// GET /api/complexes/:id/fixed-bookings
router.get(
  '/:id/fixed-bookings',
  ...ownerOnly,
  asyncHandler(async (req: Request, res: Response) => {
    const fixedBookings = await listFixedBookings(req.params.id as string);
    return res.json({ fixedBookings });
  }, 'Error al obtener los turnos fijos.')
);

// POST /api/complexes/:id/fixed-bookings
router.post(
  '/:id/fixed-bookings',
  ...ownerOnly,
  validate(fixedBookingCreateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await createFixedBooking(req.params.id as string, req.body);
    return res.status(201).json({ message: 'Turno fijo creado.', ...result });
  }, 'Error al crear el turno fijo.')
);

// DELETE /api/complexes/:id/fixed-bookings/:fixedId?cancelFuture=true
router.delete(
  '/:id/fixed-bookings/:fixedId',
  ...ownerOnly,
  asyncHandler(async (req: Request, res: Response) => {
    await deleteFixedBooking(req.params.id as string, req.params.fixedId as string, req.query.cancelFuture === 'true');
    return res.json({ message: 'Turno fijo eliminado.' });
  }, 'Error al eliminar el turno fijo.')
);

// GET /api/complexes/:id/analytics?from&to (occupancy, revenue, clients, cancellations; up to a year)
router.get(
  '/:id/analytics',
  ...ownerOnly,
  asyncHandler(async (req: Request, res: Response) => {
    const { from, to } = req.query;
    if (typeof from !== 'string' || !DATE_REGEX.test(from) || typeof to !== 'string' || !DATE_REGEX.test(to)) {
      throw new HttpError(400, 'Los parámetros "from" y "to" deben tener formato YYYY-MM-DD.');
    }
    if (to < from) {
      throw new HttpError(400, 'El parámetro "to" no puede ser anterior a "from".');
    }
    const rangeDays = (new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24);
    if (rangeDays > MAX_ANALYTICS_RANGE_DAYS) {
      throw new HttpError(400, `El rango de fechas no puede superar los ${MAX_ANALYTICS_RANGE_DAYS} días.`);
    }
    const analytics = await getComplexAnalytics(req.params.id as string, from, to);
    return res.json(analytics);
  }, 'Error al calcular las analíticas.')
);

// GET /api/complexes/:id/price-rules (prices by weekday / time slot)
router.get(
  '/:id/price-rules',
  ...ownerOnly,
  asyncHandler(async (req: Request, res: Response) => {
    const rules = await listPriceRules(req.params.id as string);
    return res.json({ rules });
  }, 'Error al obtener los precios por franja.')
);

// PUT /api/complexes/:id/price-rules (replaces every rule, re-prices upcoming free turns)
router.put(
  '/:id/price-rules',
  ...ownerOnly,
  validate(priceRulesUpdateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const rules = await savePriceRules(req.params.id as string, req.body.rules);
    return res.json({ message: 'Precios por franja guardados.', rules });
  }, 'Error al guardar los precios por franja.')
);

// GET /api/complexes/:id/closures (upcoming closures: holidays, maintenance)
router.get(
  '/:id/closures',
  ...ownerOnly,
  asyncHandler(async (req: Request, res: Response) => {
    const closures = await listClosures(req.params.id as string);
    return res.json({ closures });
  }, 'Error al obtener los cierres.')
);

// POST /api/complexes/:id/closures (409 with the affected reservations unless cancelConflicts)
router.post(
  '/:id/closures',
  ...ownerOnly,
  validate(closureCreateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await createClosure(req.params.id as string, req.body);
    if ('hasConflicts' in result) {
      return res.status(409).json({
        message: 'Hay reservas en esos días. Confirmá para cancelarlas y cerrar igual.',
        hasConflicts: true,
        conflicts: result.conflicts,
      });
    }
    return res.status(201).json({ message: 'Cierre creado.', closure: result.closure, cancelled: result.cancelled });
  }, 'Error al crear el cierre.')
);

// DELETE /api/complexes/:id/closures/:closureId
router.delete(
  '/:id/closures/:closureId',
  ...ownerOnly,
  asyncHandler(async (req: Request, res: Response) => {
    await deleteClosure(req.params.id as string, req.params.closureId as string);
    return res.json({ message: 'Cierre eliminado.' });
  }, 'Error al eliminar el cierre.')
);

export default router;
