import prisma from '../prisma';
import { z } from 'zod';
import { HttpError } from '../middleware/HttpError';
import { today } from './clock';
import { TIME_REGEX, addDays, ensureTurnsForRange, toMinutes } from './schedule.service';

const END_TIME_REGEX = /^(([01]\d|2[0-3]):[0-5]\d|24:00)$/;
const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export const priceRuleInputSchema = z
  .object({
    courtId: z.string().min(1).nullable(),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1, 'Elegí al menos un día'),
    startTime: z.string().regex(TIME_REGEX, 'La hora de inicio debe tener formato HH:MM'),
    endTime: z.string().regex(END_TIME_REGEX, 'La hora de fin debe tener formato HH:MM'),
    price: z.number().nonnegative('El precio no puede ser negativo'),
    label: z.string().trim().max(40, 'La etiqueta no puede superar los 40 caracteres').optional().nullable(),
  })
  .refine((r) => toMinutes(r.endTime) > toMinutes(r.startTime), {
    message: 'La hora de fin tiene que ser posterior a la de inicio',
    path: ['endTime'],
  });

export const priceRulesUpdateSchema = z.object({
  rules: z.array(priceRuleInputSchema).max(50, 'No se pueden cargar más de 50 reglas'),
});

export type PriceRuleInput = z.infer<typeof priceRuleInputSchema>;

export async function listPriceRules(complexId: string) {
  return prisma.priceRule.findMany({
    where: { complexId },
    include: { court: { select: { id: true, name: true } } },
    orderBy: [{ createdAt: 'asc' }],
  });
}

/** Two rules for the same target (same court, or both for every court) can't cover the same day and time. */
function assertNoOverlaps(rules: PriceRuleInput[], courtName: (id: string | null) => string) {
  for (let i = 0; i < rules.length; i++) {
    for (let j = i + 1; j < rules.length; j++) {
      const a = rules[i];
      const b = rules[j];
      if (a.courtId !== b.courtId) continue;
      const sharedDay = a.daysOfWeek.find((d) => b.daysOfWeek.includes(d));
      if (sharedDay === undefined) continue;
      const overlaps = toMinutes(a.startTime) < toMinutes(b.endTime) && toMinutes(b.startTime) < toMinutes(a.endTime);
      if (overlaps) {
        throw new HttpError(
          400,
          `Hay dos reglas que se superponen para ${courtName(a.courtId)} el ${DAY_NAMES[sharedDay]} ` +
            `(${a.startTime}–${a.endTime} y ${b.startTime}–${b.endTime}). Ajustá los horarios para que no se pisen.`
        );
      }
    }
  }
}

/**
 * Replaces every price rule of the complex and re-prices the upcoming free
 * turns (next 60 days). Booked turns keep the price they were booked at, and
 * turns with a price the owner set by hand keep it too.
 */
export async function savePriceRules(complexId: string, rules: PriceRuleInput[]) {
  const courts = await prisma.court.findMany({ where: { complexId, active: true }, select: { id: true, name: true } });
  const courtIds = new Set(courts.map((c) => c.id));
  for (const r of rules) {
    if (r.courtId !== null && !courtIds.has(r.courtId)) {
      throw new HttpError(400, 'Una de las reglas es para una cancha que no existe en el complejo.');
    }
  }
  assertNoOverlaps(rules, (id) => (id === null ? 'todas las canchas' : courts.find((c) => c.id === id)!.name));

  const todayStr = today();
  await prisma.$transaction(
    async (tx) => {
      await tx.priceRule.deleteMany({ where: { complexId } });
      if (rules.length > 0) {
        await tx.priceRule.createMany({
          data: rules.map((r) => ({
            complexId,
            courtId: r.courtId,
            daysOfWeek: [...new Set(r.daysOfWeek)].sort(),
            startTime: r.startTime,
            endTime: r.endTime,
            price: r.price,
            label: r.label?.trim() || null,
          })),
        });
      }
      await ensureTurnsForRange(complexId, todayStr, addDays(todayStr, 60), tx);
    },
    { maxWait: 5000, timeout: 20000 }
  );

  return listPriceRules(complexId);
}
