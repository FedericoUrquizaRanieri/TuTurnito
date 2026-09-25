import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import prisma from '../prisma';
import { requireAuth, UserPayload } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../middleware/asyncHandler';
import { HttpError } from '../middleware/HttpError';
import { JWT_SECRET } from '../env';

const router = Router();

const registerSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  phone: z.string().optional(),
  role: z.enum(['JUGADOR', 'DUEÑO', 'PROFESOR'], {
    errorMap: () => ({ message: 'El rol debe ser JUGADOR, DUEÑO o PROFESOR' }),
  }),
});

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'La contraseña es requerida'),
});

const updateProfileSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
});

function createToken(payload: UserPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

// TODO(hosting): revisar sameSite/secure de la cookie una vez decidido el
// hosting — si frontend y API terminan en orígenes distintos en producción,
// 'lax' no alcanza y hace falta sameSite: 'none' + secure: true, o pasar a
// Bearer token.
function setAuthCookie(res: Response, token: string) {
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
}

// POST /api/auth/register
router.post(
  '/register',
  validate(registerSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { name, email, password, phone, role } = req.body;
    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      throw new HttpError(409, 'El email ya se encuentra registrado.');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = await prisma.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        passwordHash,
        phone: phone?.trim() || null,
        role,
      },
    });

    const userPayload: UserPayload = {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      role: newUser.role,
    };

    const token = createToken(userPayload);
    setAuthCookie(res, token);

    return res.status(201).json({
      message: 'Usuario registrado exitosamente',
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        phone: newUser.phone,
        role: newUser.role,
      },
      token,
    });
  }, 'Error interno al registrar usuario.')
);

// POST /api/auth/login
router.post(
  '/login',
  validate(loginSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;
    const normalizedEmail = email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        ownedComplexes: true,
        complexLinks: { where: { active: true }, include: { complex: true } },
      },
    });

    if (!user) {
      throw new HttpError(401, 'Credenciales inválidas.');
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      throw new HttpError(401, 'Credenciales inválidas.');
    }

    const userPayload: UserPayload = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    const token = createToken(userPayload);
    setAuthCookie(res, token);

    return res.json({
      message: 'Inicio de sesión exitoso',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        ownedComplexes: user.ownedComplexes,
        linkedComplexes: user.complexLinks.map((l) => l.complex),
      },
      token,
    });
  }, 'Error interno al iniciar sesión.')
);

// POST /api/auth/logout
router.post('/logout', (req: Request, res: Response): any => {
  res.clearCookie('token');
  return res.json({ message: 'Sesión cerrada exitosamente.' });
});

// GET /api/auth/me
router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: {
        ownedComplexes: true,
        complexLinks: { where: { active: true }, include: { complex: true } },
        professorRequests: { include: { complex: true } },
      },
    });

    if (!user) {
      throw new HttpError(404, 'Usuario no encontrado.');
    }

    return res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        ownedComplexes: user.ownedComplexes,
        linkedComplexes: user.complexLinks.map((l) => l.complex),
        professorRequests: user.professorRequests,
      },
    });
  }, 'Error al obtener datos de perfil.')
);

// PUT /api/auth/me
router.put(
  '/me',
  requireAuth,
  validate(updateProfileSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { name, email, phone } = req.body;
    const userId = req.user!.id;

    if (email) {
      const normalizedEmail = email.trim().toLowerCase();
      const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (existing && existing.id !== userId) {
        throw new HttpError(409, 'El nuevo email ya está en uso por otra cuenta.');
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(name ? { name: name.trim() } : {}),
        ...(email ? { email: email.trim().toLowerCase() } : {}),
        ...(phone !== undefined ? { phone: phone?.trim() || null } : {}),
      },
    });

    return res.json({
      message: 'Perfil actualizado exitosamente',
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        role: updatedUser.role,
      },
    });
  }, 'Error al actualizar perfil.')
);

export default router;
