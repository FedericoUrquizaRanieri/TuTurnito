import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import prisma from '../prisma';

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

/** A random password that's still easy to dictate: 12 chars, no look-alikes (0/O, 1/l/I). */
export function generateTemporaryPassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.randomBytes(12), (b) => alphabet[b % alphabet.length]).join('');
}

export interface CreateOwnerInput {
  email: string;
  name: string;
  phone?: string;
  password: string;
  /** Turn an existing player/professor account with that email into an owner instead of failing. */
  promote?: boolean;
}

/**
 * Owner accounts aren't open for sign-up: they're created by hand when a
 * complex joins the platform (server/scripts/create-owner.ts).
 */
export async function createOwnerAccount(input: CreateOwnerInput) {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  const passwordHash = await hashPassword(input.password);

  if (existing) {
    if (existing.role === 'DUEÑO') {
      throw new Error(`${email} ya es una cuenta de dueño.`);
    }
    if (!input.promote) {
      throw new Error(`${email} ya existe como ${existing.role}. Usá --promote para convertirla en cuenta de dueño.`);
    }
    return prisma.user.update({ where: { id: existing.id }, data: { role: 'DUEÑO', passwordHash } });
  }

  return prisma.user.create({
    data: { email, name: input.name.trim(), phone: input.phone?.trim() || null, passwordHash, role: 'DUEÑO' },
  });
}
