import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../prisma';
import { requireAuth, requireRole, requireComplexOwner } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../middleware/asyncHandler';
import { HttpError } from '../middleware/HttpError';

const router = Router();

const complexSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  location: z.string().min(2, 'La ubicación es requerida'),
  address: z.string().min(3, 'La dirección es requerida'),
  description: z.string().optional(),
  phone: z.string().optional(),
  openingHours: z.string().optional(),
  imageUrl: z.string().optional(),
  timezone: z.string().default('America/Argentina/Buenos_Aires'),
});

// GET /api/complexes (Public catalog with search & filters)
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { search, location } = req.query;

    const whereClause: any = {};

    // Postgres' `contains` is case-sensitive by default (unlike SQLite's),
    // so an explicit case-insensitive mode is needed for search to behave
    // the same regardless of casing.
    if (search && typeof search === 'string' && search.trim()) {
      const term = search.trim();
      whereClause.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
        { location: { contains: term, mode: 'insensitive' } },
      ];
    }

    if (location && typeof location === 'string' && location.trim()) {
      whereClause.location = { contains: location.trim(), mode: 'insensitive' };
    }

    const complexes = await prisma.complex.findMany({
      where: whereClause,
      include: {
        owner: { select: { id: true, name: true, phone: true } },
        courts: {
          where: { active: true },
          select: { basePrice: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formatted = complexes.map((c) => {
      const allPrices = c.courts.map((court) => court.basePrice);
      const minPrice = allPrices.length > 0 ? Math.min(...allPrices) : null;
      const maxPrice = allPrices.length > 0 ? Math.max(...allPrices) : null;

      return {
        id: c.id,
        name: c.name,
        location: c.location,
        address: c.address,
        description: c.description,
        phone: c.phone,
        openingHours: c.openingHours,
        imageUrl: c.imageUrl,
        courtCount: c.courts.length,
        minPrice,
        maxPrice,
        owner: c.owner,
      };
    });

    return res.json({ complexes: formatted });
  }, 'Error al obtener el catálogo de complejos.')
);

// GET /api/complexes/:id (Public complex detail)
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;

    const complex = await prisma.complex.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, name: true, phone: true, email: true } },
        courts: { where: { active: true }, orderBy: { order: 'asc' } },
      },
    });

    if (!complex) {
      throw new HttpError(404, 'Complejo no encontrado.');
    }

    return res.json({ complex });
  }, 'Error al obtener el complejo.')
);

// POST /api/complexes (Create complex by owner)
router.post(
  '/',
  requireAuth,
  requireRole('DUEÑO'),
  validate(complexSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { name, location, address, description, phone, openingHours, imageUrl, timezone } = req.body;

    const newComplex = await prisma.complex.create({
      data: {
        name: name.trim(),
        location: location.trim(),
        address: address.trim(),
        description: description?.trim() || null,
        phone: phone?.trim() || null,
        openingHours: openingHours?.trim() || 'Lunes a Domingo 08:00 - 23:30',
        imageUrl: imageUrl?.trim() || null,
        timezone,
        ownerId: req.user!.id,
        courts: {
          create: [
            { name: 'Cancha 1 Cristal', order: 0 },
            { name: 'Cancha 2 Panorámica', order: 1 },
          ],
        },
      },
      include: { courts: true },
    });

    return res.status(201).json({ message: 'Complejo registrado exitosamente.', complex: newComplex });
  }, 'Error al registrar el complejo.')
);

// PUT /api/complexes/:id (Update complex by owner)
router.put(
  '/:id',
  requireAuth,
  requireRole('DUEÑO'),
  requireComplexOwner,
  validate(complexSchema.partial()),
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const data = req.body;

    const updated = await prisma.complex.update({
      where: { id },
      data: {
        ...(data.name ? { name: data.name.trim() } : {}),
        ...(data.location ? { location: data.location.trim() } : {}),
        ...(data.address ? { address: data.address.trim() } : {}),
        ...(data.description !== undefined ? { description: data.description?.trim() || null } : {}),
        ...(data.phone !== undefined ? { phone: data.phone?.trim() || null } : {}),
        ...(data.openingHours !== undefined ? { openingHours: data.openingHours?.trim() || null } : {}),
        ...(data.imageUrl !== undefined ? { imageUrl: data.imageUrl?.trim() || null } : {}),
        ...(data.timezone ? { timezone: data.timezone } : {}),
      },
    });

    return res.json({ message: 'Complejo actualizado exitosamente.', complex: updated });
  }, 'Error al actualizar el complejo.')
);

export default router;
