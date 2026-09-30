import prisma from '../prisma';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { HttpError } from '../middleware/HttpError';
import { releaseReservationTx } from './booking';
import { hasStarted, nowParts } from './clock';
import {
  TIME_REGEX,
  addDays,
  ensureTurnsForRange,
  fromMinutes,
  parseDateString,
  slotsWithin,
  toMinutes,
} from './schedule.service';

export const MAX_STUDENTS_PER_CLASS = 4;

// Classes are materialized this far ahead whenever the professor's panel is
// opened, so upcoming classes are booked (and later charged) even if nobody
// else looked at the complex's calendar.
const MATERIALIZE_DAYS = 13;

const CLOSE_TIME_REGEX = /^(([01]\d|2[0-3]):[0-5]\d|24:00)$/;

export const classScheduleCreateSchema = z.object({
  complexId: z.string().min(1, 'El complejo es requerido'),
  courtId: z.string().min(1, 'La cancha es requerida'),
  daysOfWeek: z
    .array(z.number().int().min(0).max(6))
    .min(1, 'Elegí al menos un día de la semana')
    .transform((days) => Array.from(new Set(days)).sort()),
  startTime: z.string().regex(TIME_REGEX, 'La hora de inicio debe tener formato HH:MM'),
  endTime: z.string().regex(CLOSE_TIME_REGEX, 'La hora de fin debe tener formato HH:MM'),
});

export const enrollmentCreateSchema = z
  .object({
    classScheduleId: z.string().min(1),
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: z.string().regex(TIME_REGEX),
    price: z.number().nonnegative('El valor no puede ser negativo'),
    studentId: z.string().optional(),
    newStudent: z
      .object({
        name: z.string().min(2, 'El nombre del alumno es requerido'),
        phone: z.string().min(6, 'El teléfono del alumno es requerido'),
      })
      .optional(),
  })
  .refine((b) => Boolean(b.studentId) !== Boolean(b.newStudent), {
    message: 'Elegí un alumno existente o cargá uno nuevo.',
  });

export const enrollmentUpdateSchema = z.object({
  price: z.number().nonnegative('El valor no puede ser negativo'),
});

export const absenceSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener formato YYYY-MM-DD'),
});

export const studentPaymentSchema = z.object({
  amount: z.number().positive('El monto debe ser mayor a 0'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener formato YYYY-MM-DD').optional(),
  notes: z.string().optional(),
});

export type ClassScheduleCreateInput = z.infer<typeof classScheduleCreateSchema>;
export type EnrollmentCreateInput = z.infer<typeof enrollmentCreateSchema>;
export type StudentPaymentInput = z.infer<typeof studentPaymentSchema>;

/**
 * Un-enrolls the matching open enrollments: the classes already given (today's
 * included, once started) stay charged, the upcoming ones aren't.
 */
export async function closeEnrollmentsTx(
  tx: Prisma.TransactionClient,
  where: Prisma.ClassEnrollmentWhereInput,
  now = nowParts()
) {
  const open = await tx.classEnrollment.findMany({ where: { ...where, endDate: null } });
  for (const e of open) {
    await tx.classEnrollment.update({ where: { id: e.id }, data: { endDate: firstChargeableDate(e.dayOfWeek, e.startTime, now) } });
  }
}

/**
 * First date from which a weekly class (weekday + start time) is charged, if
 * the student joins, leaves or changes price right now: today, unless
 * today's class already started — that one keeps the previous terms.
 */
export function firstChargeableDate(dayOfWeek: number, startTime: string, now = nowParts()) {
  if (parseDateString(now.today).dayOfWeek === dayOfWeek && hasStarted(now.today, startTime, now)) {
    return addDays(now.today, 1);
  }
  return now.today;
}

function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return toMinutes(aStart) < toMinutes(bEnd) && toMinutes(bStart) < toMinutes(aEnd);
}

async function getOwnedSchedule(professorId: string, classScheduleId: string) {
  const schedule = await prisma.classSchedule.findUnique({ where: { id: classScheduleId }, include: { court: true } });
  if (!schedule || schedule.professorId !== professorId || !schedule.active) {
    throw new HttpError(404, 'Horario de clases no encontrado.');
  }
  return schedule;
}

async function getOwnedStudent(professorId: string, studentId: string) {
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student || student.professorId !== professorId) {
    throw new HttpError(404, 'Alumno no encontrado.');
  }
  return student;
}

// ── Class schedules (the professor's recurring court bookings) ─────────────

export async function listClassSchedules(professorId: string) {
  return prisma.classSchedule.findMany({
    where: { professorId, active: true },
    include: {
      court: { select: { id: true, name: true } },
      complex: { select: { id: true, name: true, slug: true } },
    },
    orderBy: [{ createdAt: 'asc' }],
  });
}

/**
 * Books a court for the professor on several weekdays within a time window
 * (e.g. Cancha 2, Mon/Wed/Fri 18:00–21:00). Each turn inside the window is
 * one class. Confirmed right away (the professor is already approved at the
 * complex); the upcoming occurrences are booked immediately and the ones that
 * couldn't be (turn already taken or blocked) are returned.
 */
export async function createClassSchedule(professorId: string, input: ClassScheduleCreateInput) {
  const link = await prisma.professorComplex.findUnique({
    where: { professorId_complexId: { professorId, complexId: input.complexId } },
  });
  if (!link || !link.active) {
    throw new HttpError(403, 'No estás vinculado a este complejo.');
  }

  const court = await prisma.court.findFirst({ where: { id: input.courtId, complexId: input.complexId, active: true } });
  if (!court) {
    throw new HttpError(404, 'Cancha no encontrada.');
  }

  const slots = slotsWithin(court, input.startTime, input.endTime);
  if (slots.length === 0) {
    throw new HttpError(400, 'La franja elegida no contiene ningún turno completo de la cancha.');
  }
  // Normalize the window to the exact turns it covers.
  const startTime = slots[0].start;
  const endMinutes = toMinutes(slots[slots.length - 1].start) + court.slotMinutes;
  const endTime = endMinutes >= 24 * 60 ? '24:00' : fromMinutes(endMinutes);

  const overlappingSchedule = (
    await prisma.classSchedule.findMany({ where: { courtId: court.id, active: true } })
  ).find((s) => s.daysOfWeek.some((d) => input.daysOfWeek.includes(d)) && rangesOverlap(s.startTime, s.endTime, startTime, endTime));
  if (overlappingSchedule) {
    throw new HttpError(409, 'Ya hay un horario de clases en esa cancha que se superpone con esta franja.');
  }

  const slotStarts = new Set(slots.map((s) => s.start));
  const overlappingFixed = (
    await prisma.fixedBooking.findMany({ where: { courtId: court.id, active: true, dayOfWeek: { in: input.daysOfWeek } } })
  ).find((fb) => slotStarts.has(fb.startTime));
  if (overlappingFixed) {
    throw new HttpError(409, `Esa franja se superpone con un turno fijo del complejo (${overlappingFixed.startTime}).`);
  }

  const { today } = nowParts();
  const schedule = await prisma.classSchedule.create({
    data: {
      professorId,
      complexId: input.complexId,
      courtId: court.id,
      daysOfWeek: input.daysOfWeek,
      startTime,
      endTime,
      startDate: today,
    },
    include: {
      court: { select: { id: true, name: true } },
      complex: { select: { id: true, name: true, slug: true } },
    },
  });

  const turns = await ensureTurnsForRange(input.complexId, today, addDays(today, MATERIALIZE_DAYS));
  const skipped = turns
    .filter(
      (t) =>
        t.courtId === court.id &&
        slotStarts.has(t.startTime) &&
        input.daysOfWeek.includes(parseDateString(t.date).dayOfWeek) &&
        !hasStarted(t.date, t.startTime) &&
        t.reservation?.classScheduleId !== schedule.id
    )
    .map((t) => ({ date: t.date, startTime: t.startTime }));

  return { schedule, skipped };
}

/**
 * Ends a class schedule: its upcoming classes are cancelled (turns freed for
 * the complex) and its students are un-enrolled from today on. Classes
 * already given stay, and so does the debt they generated.
 */
export async function deleteClassSchedule(professorId: string, classScheduleId: string) {
  await getOwnedSchedule(professorId, classScheduleId);
  const now = nowParts();

  await prisma.$transaction(async (tx) => {
    await tx.classSchedule.update({ where: { id: classScheduleId }, data: { active: false } });

    const upcoming = await tx.reservation.findMany({
      where: { classScheduleId, turn: { date: { gte: now.today } } },
      include: { turn: true },
    });
    for (const r of upcoming) {
      if (hasStarted(r.turn.date, r.turn.startTime, now)) continue;
      await releaseReservationTx(tx, r, { manualOverride: false, cancelledBy: 'PROFESSOR' });
    }

    await closeEnrollmentsTx(tx, { classScheduleId }, now);
  });
}

// ── Balances ────────────────────────────────────────────────────────────

export interface StudentBalance {
  paid: number;
  owed: number;
  balance: number;
  classesCharged: number;
}

/** What the enrollment charged for the class of `date`: the price in force that day (a change only applies from the next class on). */
function priceOn(e: { price: number; prices: { price: number; fromDate: string }[] }, date: string) {
  let price = e.prices[0]?.price ?? e.price;
  for (const p of e.prices) if (p.fromDate <= date) price = p.price;
  return price;
}

/**
 * Balance of each of the professor's students: every class they're enrolled
 * in that has already started adds its price (the one in force that day) as debt (only classes that
 * actually took place — a cancelled occurrence has no reservation — and
 * that the student didn't miss), and every payment the professor records
 * subtracts it.
 */
export async function computeBalances(professorId: string, studentIds?: string[]) {
  const enrollments = await prisma.classEnrollment.findMany({
    where: { student: { professorId }, ...(studentIds ? { studentId: { in: studentIds } } : {}) },
    include: { absences: true, prices: { orderBy: { fromDate: 'asc' } } },
  });
  const scheduleIds = Array.from(new Set(enrollments.map((e) => e.classScheduleId)));

  const reservations = scheduleIds.length
    ? await prisma.reservation.findMany({
        where: { classScheduleId: { in: scheduleIds } },
        include: { turn: { select: { date: true, startTime: true, endTime: true } } },
      })
    : [];

  const now = nowParts();
  const given = reservations.filter((r) => hasStarted(r.turn.date, r.turn.startTime, now));

  type Charge = { studentId: string; enrollmentId: string; date: string; startTime: string; endTime: string; price: number };
  const charges: Charge[] = [];
  const absentClasses: Charge[] = [];
  for (const e of enrollments) {
    const absentDates = new Set(e.absences.map((a) => a.date));
    for (const r of given) {
      if (
        r.classScheduleId === e.classScheduleId &&
        r.turn.startTime === e.startTime &&
        parseDateString(r.turn.date).dayOfWeek === e.dayOfWeek &&
        r.turn.date >= e.startDate &&
        (!e.endDate || r.turn.date < e.endDate)
      ) {
        const charge = { studentId: e.studentId, enrollmentId: e.id, date: r.turn.date, startTime: r.turn.startTime, endTime: r.turn.endTime, price: priceOn(e, r.turn.date) };
        (absentDates.has(r.turn.date) ? absentClasses : charges).push(charge);
      }
    }
  }
  // Absences marked ahead of time (the student let the professor know).
  const upcomingAbsences = enrollments.flatMap((e) =>
    e.absences
      .filter((a) => !hasStarted(a.date, e.startTime, now))
      .map((a) => ({ enrollmentId: e.id, date: a.date, startTime: e.startTime }))
  );

  const ids = studentIds ?? Array.from(new Set(enrollments.map((e) => e.studentId)));
  const payments = await prisma.payment.findMany({
    where: { payableType: 'STUDENT_CLASS', status: 'PAID', ...(studentIds ? { payableId: { in: ids } } : { recordedById: professorId }) },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
  });

  const balances = new Map<string, StudentBalance>();
  const get = (id: string) => {
    if (!balances.has(id)) balances.set(id, { paid: 0, owed: 0, balance: 0, classesCharged: 0 });
    return balances.get(id)!;
  };
  for (const c of charges) {
    const b = get(c.studentId);
    b.owed += c.price;
    b.classesCharged += 1;
  }
  for (const p of payments) get(p.payableId).paid += p.amount;
  for (const b of balances.values()) b.balance = b.paid - b.owed;

  return { balances, charges, absentClasses, upcomingAbsences, payments };
}

export const EMPTY_BALANCE: StudentBalance = { paid: 0, owed: 0, balance: 0, classesCharged: 0 };

// ── Weekly class grid ─────────────────────────────────────────────────────

/**
 * The professor's weekly grid: one entry per class (schedule × weekday ×
 * turn), with its enrolled students (up to 4) and each one's balance.
 */
export async function getWeeklyClasses(professorId: string) {
  const schedules = await prisma.classSchedule.findMany({
    where: { professorId, active: true },
    include: { court: true, complex: { select: { id: true, name: true, slug: true } } },
  });

  // Keep upcoming classes booked so they get charged once they happen.
  const { today } = nowParts();
  for (const complexId of new Set(schedules.map((s) => s.complexId))) {
    await ensureTurnsForRange(complexId, today, addDays(today, MATERIALIZE_DAYS));
  }

  const enrollments = await prisma.classEnrollment.findMany({
    where: { classScheduleId: { in: schedules.map((s) => s.id) }, endDate: null },
    include: { student: true },
    orderBy: { createdAt: 'asc' },
  });

  const students = await prisma.student.findMany({ where: { professorId, active: true }, orderBy: { name: 'asc' } });
  const { balances } = await computeBalances(professorId);

  const classes = schedules.flatMap((s) =>
    s.daysOfWeek.flatMap((dayOfWeek) =>
      slotsWithin(s.court, s.startTime, s.endTime).map((slot) => ({
        key: `${s.id}_${dayOfWeek}_${slot.start}`,
        classScheduleId: s.id,
        dayOfWeek,
        startTime: slot.start,
        endTime: slot.end,
        court: { id: s.court.id, name: s.court.name },
        complex: s.complex,
        students: enrollments
          .filter((e) => e.classScheduleId === s.id && e.dayOfWeek === dayOfWeek && e.startTime === slot.start)
          .map((e) => ({
            enrollmentId: e.id,
            studentId: e.studentId,
            name: e.student.name,
            phone: e.student.phone,
            price: e.price,
            balance: balances.get(e.studentId) ?? EMPTY_BALANCE,
          })),
      }))
    )
  );

  return {
    classes,
    students: students.map((st) => ({ ...st, balance: balances.get(st.id) ?? EMPTY_BALANCE })),
  };
}

// ── Enrollments ───────────────────────────────────────────────────────────

export async function addEnrollment(professorId: string, input: EnrollmentCreateInput) {
  const schedule = await getOwnedSchedule(professorId, input.classScheduleId);

  if (!schedule.daysOfWeek.includes(input.dayOfWeek)) {
    throw new HttpError(400, 'Ese día no forma parte del horario de clases.');
  }
  if (!slotsWithin(schedule.court, schedule.startTime, schedule.endTime).some((s) => s.start === input.startTime)) {
    throw new HttpError(400, 'Ese horario no forma parte del horario de clases.');
  }

  if (input.studentId) {
    const student = await getOwnedStudent(professorId, input.studentId);
    if (!student.active) throw new HttpError(404, 'Alumno no encontrado.');
  }

  return prisma.$transaction(async (tx) => {
    // Locks the schedule row so concurrent enrollments are counted one at a
    // time: otherwise two requests could both see 3 students and both enroll.
    await tx.$queryRaw`SELECT id FROM "ClassSchedule" WHERE id = ${schedule.id} FOR UPDATE`;

    const current = await tx.classEnrollment.findMany({
      where: { classScheduleId: schedule.id, dayOfWeek: input.dayOfWeek, startTime: input.startTime, endDate: null },
    });
    if (current.length >= MAX_STUDENTS_PER_CLASS) {
      throw new HttpError(409, `La clase ya tiene ${MAX_STUDENTS_PER_CLASS} alumnos.`);
    }
    if (input.studentId && current.some((e) => e.studentId === input.studentId)) {
      throw new HttpError(409, 'Ese alumno ya está en esta clase.');
    }

    const studentId =
      input.studentId ??
      (
        await tx.student.create({
          data: { professorId, name: input.newStudent!.name.trim(), phone: input.newStudent!.phone.trim() },
        })
      ).id;

    // Joining after today's class started: that class isn't charged.
    const startDate = firstChargeableDate(input.dayOfWeek, input.startTime);
    return tx.classEnrollment.create({
      data: {
        classScheduleId: schedule.id,
        dayOfWeek: input.dayOfWeek,
        startTime: input.startTime,
        studentId,
        price: input.price,
        startDate,
        prices: { create: { price: input.price, fromDate: startDate } },
      },
      include: { student: true },
    });
  });
}

async function getOwnedEnrollment(professorId: string, enrollmentId: string) {
  const enrollment = await prisma.classEnrollment.findUnique({
    where: { id: enrollmentId },
    include: { classSchedule: true },
  });
  if (!enrollment || enrollment.classSchedule.professorId !== professorId || enrollment.endDate) {
    throw new HttpError(404, 'Inscripción no encontrada.');
  }
  return enrollment;
}

/**
 * Changes what the student pays per class from the next class on: the
 * classes already given keep the price they had.
 */
export async function updateEnrollmentPrice(professorId: string, enrollmentId: string, price: number) {
  const enrollment = await getOwnedEnrollment(professorId, enrollmentId);
  const fromDate = firstChargeableDate(enrollment.dayOfWeek, enrollment.startTime);

  return prisma.classEnrollment.update({
    where: { id: enrollmentId },
    data: {
      price,
      prices: {
        upsert: {
          where: { enrollmentId_fromDate: { enrollmentId, fromDate } },
          create: { price, fromDate },
          update: { price },
        },
      },
    },
  });
}

/** Removes the student from the class; the classes they already took (today's included, once started) stay charged. */
export async function removeEnrollment(professorId: string, enrollmentId: string) {
  await getOwnedEnrollment(professorId, enrollmentId);
  await prisma.$transaction((tx) => closeEnrollmentsTx(tx, { id: enrollmentId }));
}

// ── Student account: balance, charges and payments ─────────────────────────

export async function getStudentAccount(professorId: string, studentId: string) {
  const student = await getOwnedStudent(professorId, studentId);
  const { balances, charges, absentClasses, upcomingAbsences, payments } = await computeBalances(professorId, [studentId]);
  const newestFirst = <T extends { date: string; startTime: string }>(a: T, b: T) =>
    a.date === b.date ? b.startTime.localeCompare(a.startTime) : b.date.localeCompare(a.date);

  return {
    student,
    balance: balances.get(studentId) ?? EMPTY_BALANCE,
    charges: charges.sort(newestFirst),
    absences: [
      ...absentClasses.map((c) => ({ enrollmentId: c.enrollmentId, date: c.date, startTime: c.startTime, price: c.price })),
      ...upcomingAbsences.map((a) => ({ ...a, price: 0 })),
    ].sort(newestFirst),
    payments,
  };
}

/**
 * Marks the student absent from one date of their class, so that class isn't
 * charged. Works for a class already given or ahead of time (when the
 * student lets the professor know), but only on a date the student is
 * actually enrolled for.
 */
export async function markAbsent(professorId: string, enrollmentId: string, date: string) {
  const enrollment = await prisma.classEnrollment.findUnique({ where: { id: enrollmentId }, include: { classSchedule: true } });
  if (!enrollment || enrollment.classSchedule.professorId !== professorId) {
    throw new HttpError(404, 'Inscripción no encontrada.');
  }
  if (parseDateString(date).dayOfWeek !== enrollment.dayOfWeek) {
    throw new HttpError(400, 'Esa fecha no corresponde al día de la clase.');
  }
  if (date < enrollment.startDate || (enrollment.endDate && date >= enrollment.endDate)) {
    throw new HttpError(400, 'El alumno no estaba inscripto en la clase de esa fecha.');
  }

  return prisma.classAbsence.upsert({
    where: { enrollmentId_date: { enrollmentId, date } },
    create: { enrollmentId, date },
    update: {},
  });
}

/** Undoes an absence: the class is charged again once it has started. */
export async function unmarkAbsent(professorId: string, enrollmentId: string, date: string) {
  const enrollment = await prisma.classEnrollment.findUnique({ where: { id: enrollmentId }, include: { classSchedule: true } });
  if (!enrollment || enrollment.classSchedule.professorId !== professorId) {
    throw new HttpError(404, 'Inscripción no encontrada.');
  }
  await prisma.classAbsence.deleteMany({ where: { enrollmentId, date } });
}

export async function createStudentPayment(professorId: string, studentId: string, input: StudentPaymentInput) {
  const student = await getOwnedStudent(professorId, studentId);
  return prisma.payment.create({
    data: {
      payableType: 'STUDENT_CLASS',
      payableId: studentId,
      amount: input.amount,
      status: 'PAID',
      date: input.date || nowParts().today,
      recordedById: professorId,
      notes: input.notes?.trim() || `Cobro de clases de ${student.name}`,
    },
  });
}

/** Deletes a payment recorded by mistake. */
export async function deleteStudentPayment(professorId: string, paymentId: string) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.payableType !== 'STUDENT_CLASS' || payment.recordedById !== professorId) {
    throw new HttpError(404, 'Cobro no encontrado.');
  }
  await prisma.payment.delete({ where: { id: paymentId } });
}
