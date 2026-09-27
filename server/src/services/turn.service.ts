import prisma from '../prisma';
import { z } from 'zod';
import { HttpError } from '../middleware/HttpError';
import { formatDate } from './schedule.service';

export const turnOwnerUpdateSchema = z
  .object({
    state: z.enum(['AVAILABLE', 'BLOCKED', 'TOURNAMENT']).optional(),
    price: z.number().nonnegative('El precio no puede ser negativo').optional(),
    label: z.string().max(80, 'La etiqueta no puede superar los 80 caracteres').nullable().optional(),
  })
  .refine((b) => b.state !== undefined || b.price !== undefined || b.label !== undefined, {
    message: 'No se envió ningún cambio para el turno.',
  });

export type TurnOwnerUpdateInput = z.infer<typeof turnOwnerUpdateSchema>;

/**
 * Owner edits one concrete turn from the reservations grid: block it, mark it
 * as a tournament, free it again, or change its price. The turn is flagged
 * `manualOverride` so the automatic re-sync from the court's range never
 * reverts the owner's change.
 */
export async function updateTurnByOwner(complexId: string, turnId: string, input: TurnOwnerUpdateInput) {
  const turn = await prisma.turn.findUnique({ where: { id: turnId }, include: { court: true, reservation: true } });

  if (!turn || turn.court.complexId !== complexId) {
    throw new HttpError(404, 'Turno no encontrado.');
  }
  if (turn.date < formatDate(new Date())) {
    throw new HttpError(400, 'No se pueden modificar turnos de días pasados.');
  }
  if (turn.state === 'OCCUPIED' || turn.reservation) {
    throw new HttpError(409, 'El turno tiene una reserva. Cancelala primero para modificarlo.');
  }

  const nextState = input.state ?? turn.state;
  // The label only makes sense on tournaments; it's cleared otherwise.
  const nextLabel = nextState === 'TOURNAMENT' ? (input.label !== undefined ? input.label?.trim() || null : turn.label) : null;

  // Guarded so a booking that lands between the read above and this write wins.
  const result = await prisma.turn.updateMany({
    where: { id: turnId, state: { not: 'OCCUPIED' } },
    data: {
      state: nextState,
      price: input.price ?? turn.price,
      label: nextLabel,
      manualOverride: true,
    },
  });
  if (result.count === 0) {
    throw new HttpError(409, 'El turno acaba de ser reservado.');
  }

  return prisma.turn.findUnique({ where: { id: turnId } });
}
