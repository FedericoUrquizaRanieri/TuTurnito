import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../prisma';
import { JWT_SECRET } from '../env';

export interface UserPayload {
  id: string;
  email: string;
  name: string;
  role: 'JUGADOR' | 'DUEÑO' | 'PROFESOR';
}

declare global {
  namespace Express {
    interface Request {
      user?: UserPayload;
    }
  }
}

export const authenticateToken = (req: Request, res: Response, next: NextFunction): void => {
  const token = req.cookies?.token || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.split(' ')[1] : null);

  if (!token) {
    return next();
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as UserPayload;
    req.user = payload;
    next();
  } catch (error) {
    // Token is invalid/expired, continue without user
    next();
  }
};

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'No autenticado. Por favor inicia sesión.' });
  }
  next();
};

export const requireRole = (...allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'No autenticado. Por favor inicia sesión.' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Acceso denegado. No tienes permisos para realizar esta acción.' });
    }
    next();
  };
};

export const requireComplexOwner = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'No autenticado.' });
  }

  const complexId = req.params.id || req.params.complexId || req.body.complexId;
  if (!complexId) {
    return res.status(400).json({ error: 'ID de complejo no provisto.' });
  }

  try {
    const complex = await prisma.complex.findUnique({
      where: { id: complexId },
    });

    if (!complex) {
      return res.status(404).json({ error: 'Complejo no encontrado.' });
    }

    if (complex.ownerId !== req.user.id) {
      return res.status(403).json({ error: 'Acceso denegado. No eres el dueño de este complejo.' });
    }

    next();
  } catch (error) {
    return res.status(500).json({ error: 'Error al verificar permisos de dueño.' });
  }
};

export const requireApprovedProfessor = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'No autenticado.' });
  }

  if (req.user.role !== 'PROFESOR') {
    return res.status(403).json({ error: 'Solo usuarios con rol Profesor pueden realizar esta acción.' });
  }

  const complexId = req.params.complexId || req.body.complexId;
  if (!complexId) {
    return res.status(400).json({ error: 'ID de complejo no provisto.' });
  }

  try {
    const link = await prisma.professorComplex.findUnique({
      where: {
        professorId_complexId: {
          professorId: req.user.id,
          complexId,
        },
      },
    });

    if (!link || !link.active) {
      return res.status(403).json({ error: 'No estás autorizado ni vinculado activamente a este complejo.' });
    }

    next();
  } catch (error) {
    return res.status(500).json({ error: 'Error al verificar vinculación de profesor.' });
  }
};
