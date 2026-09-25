import { Router, Request, Response } from 'express';
import prisma from '../prisma';
import { requireAuth, requireRole, requireComplexOwner } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../middleware/asyncHandler';
import { HttpError } from '../middleware/HttpError';
import {
  saveComplexSchedule,
  exportScheduleToExcel,
  importScheduleFromExcel,
  scheduleUpdateSchema,
} from '../services/schedule.service';

const router = Router({ mergeParams: true });

// GET /api/complexes/:id/schedule (Owner weekly grid)
router.get(
  '/:id/schedule',
  requireAuth,
  requireRole('DUEÑO'),
  requireComplexOwner,
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;

    const courts = await prisma.court.findMany({
      where: { complexId: id, active: true },
      include: { templateCells: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] } },
      orderBy: { order: 'asc' },
    });

    return res.json({ courts });
  }, 'Error al obtener la grilla semanal.')
);

// PUT /api/complexes/:id/schedule (Save weekly grid with conflict check)
router.put(
  '/:id/schedule',
  requireAuth,
  requireRole('DUEÑO'),
  requireComplexOwner,
  validate(scheduleUpdateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const result = await saveComplexSchedule(id, req.body);

    if ('hasConflicts' in result && result.hasConflicts) {
      return res.status(409).json({
        message: 'Existen reservas futuras afectadas por estos cambios.',
        hasConflicts: true,
        conflictType: result.conflictType,
        conflicts: result.conflicts,
      });
    }

    return res.json({ message: 'Grilla semanal guardada y turnos actualizados exitosamente.', success: true });
  }, 'Error al guardar la grilla semanal.')
);

// GET /api/complexes/:id/schedule/export (Export grid as .xlsx)
router.get(
  '/:id/schedule/export',
  requireAuth,
  requireRole('DUEÑO'),
  requireComplexOwner,
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const buffer = await exportScheduleToExcel(id);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="canchas-grilla-${id}.xlsx"`);
    return res.send(buffer);
  }, 'Error al exportar la grilla a Excel.')
);

// POST /api/complexes/:id/schedule/import (Import grid from base64 or raw body)
router.post(
  '/:id/schedule/import',
  requireAuth,
  requireRole('DUEÑO'),
  requireComplexOwner,
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const { fileBase64 } = req.body;

    try {
      if (!fileBase64) {
        throw new HttpError(400, 'No se envió el archivo en formato base64.');
      }
      const buffer = Buffer.from(fileBase64, 'base64');
      await importScheduleFromExcel(id, buffer);
      return res.json({ message: 'Grilla importada exitosamente desde Excel.' });
    } catch (error: any) {
      // Import failures are always shown as 400s with the specific reason
      // (missing columns, bad rows, etc.), never a generic 500 — this route
      // never had a fallback message, it always surfaced the real error.
      if (error instanceof HttpError) throw error;
      throw new HttpError(400, error.message || 'Error al importar archivo Excel.');
    }
  })
);

export default router;
