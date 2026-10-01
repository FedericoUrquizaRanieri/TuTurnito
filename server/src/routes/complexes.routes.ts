import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../prisma';
import { requireAuth, requireRole, requireComplexOwner } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../middleware/asyncHandler';
import { HttpError } from '../middleware/HttpError';
import { Prisma } from '@prisma/client';
import { generateUniqueSlug, isSlugTaken, slugFormatError } from '../services/slug';

const router = Router();

const complexSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(100),
  location: z.string().min(2, 'La ubicación es requerida').max(100),
  address: z.string().min(3, 'La dirección es requerida').max(200),
  description: z.string().max(2000).optional(),
  phone: z.string().max(30).optional(),
  openingHours: z.string().max(200).optional(),
  // Shown as the complex's photo: only a real https address (or empty to remove it).
  imageUrl: z
    .string()
    .trim()
    .max(2000)
    .refine((v) => v === '' || /^https:\/\/[^\s]+$/i.test(v), 'La imagen tiene que ser un link que empiece con https://')
    .optional(),
  timezone: z.string().max(64).default('America/Argentina/Buenos_Aires'),
});

// The owner may customize the public URL when editing; on create it's
// always derived from the name.
const complexUpdateSchema = complexSchema.partial().extend({
  slug: z.string().trim().toLowerCase().max(80).optional(),
  // Players can cancel from the app up to this many hours before the turn (0 = until it starts).
  cancellationHours: z.number().int().min(0, 'Las horas no pueden ser negativas').max(72, 'Como máximo 72 horas').optional(),
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
        owner: { select: { id: true, name: true } },
        courts: {
          where: { active: true },
          select: { basePrice: true },
        },
        priceRules: { select: { price: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formatted = complexes.map((c) => {
      // Price rules (peak hours, promos) widen the range beyond the base prices.
      const allPrices = [...c.courts.map((court) => court.basePrice), ...(c.courts.length ? c.priceRules.map((r) => r.price) : [])];
      const minPrice = allPrices.length > 0 ? Math.min(...allPrices) : null;
      const maxPrice = allPrices.length > 0 ? Math.max(...allPrices) : null;

      return {
        id: c.id,
        slug: c.slug,
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

// GET /api/complexes/:idOrSlug (Public complex detail, by id or by public slug)
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const idOrSlug = req.params.id as string;

    const complex = await prisma.complex.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug.toLowerCase() }] },
      include: {
        // Public page: the owner's own email and phone stay private (the
        // complex has its own contact phone).
        owner: { select: { id: true, name: true } },
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

    const createWithSlug = async () =>
      prisma.complex.create({
        data: {
          slug: await generateUniqueSlug(name),
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

    // Two complexes with the same name created at the same instant can race
    // for the same slug; the loser just picks the next free one.
    let newComplex;
    for (let attempt = 0; ; attempt++) {
      try {
        newComplex = await createWithSlug();
        break;
      } catch (error) {
        const isSlugClash = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
        if (!isSlugClash || attempt >= 2) throw error;
      }
    }

    return res.status(201).json({ message: 'Complejo registrado exitosamente.', complex: newComplex });
  }, 'Error al registrar el complejo.')
);

// PUT /api/complexes/:id (Update complex by owner)
router.put(
  '/:id',
  requireAuth,
  requireRole('DUEÑO'),
  requireComplexOwner,
  validate(complexUpdateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const data = req.body;

    if (data.slug !== undefined) {
      const formatError = slugFormatError(data.slug);
      if (formatError) throw new HttpError(400, formatError);
      if (await isSlugTaken(data.slug, id)) {
        throw new HttpError(409, 'Esa dirección ya la usa otro complejo. Elegí otra.');
      }
    }

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
        ...(data.slug ? { slug: data.slug } : {}),
        ...(data.cancellationHours !== undefined ? { cancellationHours: data.cancellationHours } : {}),
      },
    });

    return res.json({ message: 'Complejo actualizado exitosamente.', complex: updated });
  }, 'Error al actualizar el complejo.')
);

export default router;
