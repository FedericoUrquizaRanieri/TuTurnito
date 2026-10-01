import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import prisma from '../prisma';
import { requireAuth, UserPayload } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { requireTurnstile } from '../middleware/turnstile';
import { asyncHandler } from '../middleware/asyncHandler';
import { HttpError } from '../middleware/HttpError';
import { JWT_SECRET } from '../env';
import { hashPassword } from '../services/auth.service';

const router = Router();

const registerSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(80),
  email: z.string().email('Email inválido').max(254),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(128),
  phone: z.string().max(30).optional(),
  // Owner accounts are created by hand when a complex joins (npm run create-owner).
  role: z.enum(['JUGADOR', 'PROFESOR'], {
    errorMap: () => ({ message: 'El rol debe ser JUGADOR o PROFESOR' }),
  }),
});

const loginSchema = z.object({
  email: z.string().email('Email inválido').max(254),
  password: z.string().min(1, 'La contraseña es requerida').max(128),
});

const updateProfileSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  email: z.string().email().max(254).optional(),
  phone: z.string().max(30).optional(),
  emailReminders: z.boolean().optional(),
  // Required to change the email or the password.
  currentPassword: z.string().max(128).optional(),
  newPassword: z.string().min(8, 'La nueva contraseña debe tener al menos 8 caracteres').max(128).optional(),
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
  requireTurnstile,
  validate(registerSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { name, email, password, phone, role } = req.body;
    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      throw new HttpError(409, 'El email ya se encuentra registrado.');
    }

    const passwordHash = await hashPassword(password);

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
        emailReminders: newUser.emailReminders,
      },
      token,
    });
  }, 'Error interno al registrar usuario.')
);

// POST /api/auth/login
router.post(
  '/login',
  requireTurnstile,
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
        emailReminders: user.emailReminders,
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
        emailReminders: user.emailReminders,
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
    const { name, email, phone, emailReminders, currentPassword, newPassword } = req.body;
    const userId = req.user!.id;

    const current = await prisma.user.findUnique({ where: { id: userId } });
    if (!current) {
      throw new HttpError(404, 'Usuario no encontrado.');
    }

    const normalizedEmail = email ? email.trim().toLowerCase() : undefined;
    const emailChanges = normalizedEmail !== undefined && normalizedEmail !== current.email;

    // Whoever holds the session (a borrowed phone, a stolen cookie) must
    // not be able to take the account over by swapping its email or password.
    if (emailChanges || newPassword) {
      if (!currentPassword || !(await bcrypt.compare(currentPassword, current.passwordHash))) {
        throw new HttpError(403, 'Para cambiar el email o la contraseña ingresá tu contraseña actual.');
      }
    }

    if (emailChanges) {
      const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (existing && existing.id !== userId) {
        throw new HttpError(409, 'El nuevo email ya está en uso por otra cuenta.');
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(name ? { name: name.trim() } : {}),
        ...(emailChanges ? { email: normalizedEmail } : {}),
        ...(phone !== undefined ? { phone: phone?.trim() || null } : {}),
        ...(emailReminders !== undefined ? { emailReminders } : {}),
        ...(newPassword ? { passwordHash: await hashPassword(newPassword) } : {}),
      },
    });

    // The session token carries the name and email: reissue it so they don't go stale.
    setAuthCookie(res, createToken({ id: updatedUser.id, email: updatedUser.email, name: updatedUser.name, role: updatedUser.role }));

    return res.json({
      message: 'Perfil actualizado exitosamente',
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        role: updatedUser.role,
        emailReminders: updatedUser.emailReminders,
      },
    });
  }, 'Error al actualizar perfil.')
);

export default router;
