import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../middleware/asyncHandler';
import { HttpError } from '../middleware/HttpError';
import {
  openMatchInputSchema,
  openMatchForReservation,
  updateOpenMatch,
  closeOpenMatch,
  listOpenMatches,
  joinOpenMatch,
  leaveOpenMatch,
  removePlayer,
  MATCH_CATEGORIES,
} from '../services/openMatch.service';

const router = Router();

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/open-matches?complexId&location&date&category (public feed; the viewer's own state if logged in)
router.get(
  '/open-matches',
  asyncHandler(async (req: Request, res: Response) => {
    const { complexId, location, date, category } = req.query;
    if (date !== undefined && (typeof date !== 'string' || !DATE_REGEX.test(date))) {
      throw new HttpError(400, 'El parámetro "date" debe tener formato YYYY-MM-DD.');
    }
    if (category !== undefined && !MATCH_CATEGORIES.includes(category as (typeof MATCH_CATEGORIES)[number])) {
      throw new HttpError(400, 'Categoría inválida.');
    }
    const matches = await listOpenMatches(
      {
        complexId: typeof complexId === 'string' && complexId ? complexId : undefined,
        location: typeof location === 'string' && location.trim() ? location.trim() : undefined,
        date: date as string | undefined,
        category: category as string | undefined,
      },
      req.user
    );
    return res.json({ matches, categories: MATCH_CATEGORIES });
  }, 'Error al obtener los partidos abiertos.')
);

// POST /api/open-matches/:id/join
router.post(
  '/open-matches/:id/join',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const match = await joinOpenMatch(req.params.id as string, req.user!);
    return res.status(201).json({ message: '¡Te sumaste al partido!', match });
  }, 'Error al sumarte al partido.')
);

// DELETE /api/open-matches/:id/join (leave a match I joined)
router.delete(
  '/open-matches/:id/join',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    await leaveOpenMatch(req.params.id as string, req.user!);
    return res.json({ message: 'Te bajaste del partido.' });
  }, 'Error al bajarte del partido.')
);

// DELETE /api/open-matches/:id/players/:userId (organizer removes a player)
router.delete(
  '/open-matches/:id/players/:userId',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    await removePlayer(req.params.id as string, req.user!, req.params.userId as string);
    return res.json({ message: 'Jugador quitado del partido.' });
  }, 'Error al quitar al jugador.')
);

// POST /api/reservations/:id/open-match (publish my booking: "me faltan jugadores")
router.post(
  '/reservations/:id/open-match',
  requireAuth,
  validate(openMatchInputSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const match = await openMatchForReservation(req.params.id as string, req.user!, req.body);
    return res.status(201).json({ message: 'Partido publicado. Te avisamos por email cuando se sume alguien.', match });
  }, 'Error al publicar el partido.')
);

// PATCH /api/reservations/:id/open-match
router.patch(
  '/reservations/:id/open-match',
  requireAuth,
  validate(openMatchInputSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const match = await updateOpenMatch(req.params.id as string, req.user!, req.body);
    return res.json({ message: 'Partido actualizado.', match });
  }, 'Error al actualizar el partido.')
);

// DELETE /api/reservations/:id/open-match (stop looking for players)
router.delete(
  '/reservations/:id/open-match',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    await closeOpenMatch(req.params.id as string, req.user!);
    return res.json({ message: 'El partido ya no está publicado.' });
  }, 'Error al cerrar el partido.')
);

export default router;
