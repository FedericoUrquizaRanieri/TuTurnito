import prisma from '../prisma';
import { Prisma, Payment, PaymentStatus, PayableType } from '@prisma/client';
import { today } from './clock';

type DbClient = typeof prisma | Prisma.TransactionClient;

/** Indexes payments by their payableId, for joining a list of payments back to their parent (one payment per parent). */
export function buildPaymentMap(payments: Payment[]): Map<string, Payment> {
  const map = new Map<string, Payment>();
  for (const p of payments) map.set(p.payableId, p);
  return map;
}

/** Sums a list of payments into paid/pending totals by status. */
export function summarizeByStatus(payments: Payment[]): { totalPaid: number; totalPending: number } {
  let totalPaid = 0;
  let totalPending = 0;
  for (const p of payments) {
    if (p.status === 'PAID') totalPaid += p.amount;
    else totalPending += p.amount;
  }
  return { totalPaid, totalPending };
}

export async function getPaymentsByPayableIds(
  payableType: PayableType,
  payableIds: string[],
  client: DbClient = prisma
): Promise<Payment[]> {
  if (payableIds.length === 0) return [];
  return client.payment.findMany({ where: { payableType, payableId: { in: payableIds } } });
}

/**
 * Finds the single payment for a given payable (e.g. a reservation) and
 * updates it, or creates one if none exists yet. This matches the "one
 * payment per reservation, the owner just toggles it" semantics of the
 * reservation-payment endpoint specifically — professor class payments are
 * a different shape (one row created per class, never upserted) and are
 * handled directly in professor.service.ts instead of through this helper.
 */
export async function findOrCreatePaymentForPayable(
  payableType: PayableType,
  payableId: string,
  data: { status: PaymentStatus; amount: number; recordedById: string },
  client: DbClient = prisma
): Promise<Payment> {
  const existing = await client.payment.findFirst({ where: { payableType, payableId } });
  const date = today();

  if (existing) {
    return client.payment.update({
      where: { id: existing.id },
      data: { status: data.status, amount: data.amount, recordedById: data.recordedById, date },
    });
  }

  return client.payment.create({
    data: { payableType, payableId, status: data.status, amount: data.amount, recordedById: data.recordedById, date },
  });
}
