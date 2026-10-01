import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole, requireComplexOwner } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../middleware/asyncHandler';
import { HttpError } from '../middleware/HttpError';
import {
  createReservation,
  cancelReservation,
  getOwnerReservationsView,
  updateReservationPayment,
  getMyReservations,
} from '../services/reservation.service';
import { openMatchInputSchema } from '../services/openMatch.service';

const router = Router();

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Players and professors book with their account's name and phone; these
// fields are only read when the owner books on behalf of a client.
const reservationSchema = z.object({
  guestName: z.string().trim().min(2, 'El nombre es requerido').max(80).optional(),
  guestPhone: z.string().trim().min(6, 'El teléfono es requerido').max(30).optional(),
  guestEmail: z.string().email().max(254).optional().or(z.literal('')),
  type: z.enum(['PLAYER', 'CLASS']).default('PLAYER'),
  notes: z.string().max(500).optional(),
  // "Me faltan jugadores": publish the booking as an open match right away.
  openMatch: openMatchInputSchema.optional(),
});

const paymentUpdateSchema = z.object({
  status: z.enum(['PAID', 'PENDING']).optional(),
  amount: z.number().nonnegative().optional(),
});

// POST /api/turns/:turnId/reservations (Atomic reservation creation). Needs
// an account: anonymous bookings let anyone fill every slot with fake phones.
router.post(
  '/turns/:turnId/reservations',
  requireAuth,
  validate(reservationSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const turnId = req.params.turnId as string;
    const result = await createReservation(turnId, req.body, req.user!);

    if (!result.success) {
      if (result.conflictType === 'NOT_FOUND') {
        return res.status(404).json({ error: result.message });
      }
      return res.status(409).json({ error: result.message, state: result.conflictType });
    }

    return res.status(201).json({
      message: '¡Reserva confirmada con éxito!',
      reservation: result.reservation,
      turn: result.turn,
      payment: result.payment,
    });
  }, 'Error al procesar la reserva.')
);

// DELETE /api/reservations/:id (Cancellation by Player or Owner)
router.delete(
  '/reservations/:id',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    await cancelReservation(id, req.user!);
    return res.json({ message: 'Reserva cancelada exitosamente y turno liberado.' });
  }, 'Error al cancelar la reserva.')
);

// GET /api/complexes/:id/reservations?from&to (Owner reservations & payments view)
router.get(
  '/complexes/:id/reservations',
  requireAuth,
  requireRole('DUEÑO'),
  requireComplexOwner,
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const { from, to } = req.query;
    if ((from !== undefined && (typeof from !== 'string' || !DATE_REGEX.test(from))) ||
        (to !== undefined && (typeof to !== 'string' || !DATE_REGEX.test(to)))) {
      throw new HttpError(400, 'Los parámetros "from" y "to" deben tener formato YYYY-MM-DD.');
    }
    const view = await getOwnerReservationsView(id, { from: from as string | undefined, to: to as string | undefined });
    return res.json(view);
  }, 'Error al obtener las reservas del complejo.')
);

// PUT /api/reservations/:id/payment (Owner registers or toggles payment)
router.put(
  '/reservations/:id/payment',
  requireAuth,
  requireRole('DUEÑO'),
  validate(paymentUpdateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const payment = await updateReservationPayment(id, req.user!, req.body);
    return res.json({
      message: `Pago marcado como ${payment.status === 'PAID' ? 'PAGADO' : 'PENDIENTE'}.`,
      payment,
    });
  }, 'Error al actualizar el estado del pago.')
);

// GET /api/reservations/my ("Mis Reservas" for authenticated player)
router.get(
  '/reservations/my',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const reservations = await getMyReservations(req.user!.id, req.user!.email);
    return res.json({ reservations });
  }, 'Error al obtener tus reservas.')
);

export default router;
