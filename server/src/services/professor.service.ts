import prisma from '../prisma';
import { ProfessorRequestStatus } from '@prisma/client';
import { HttpError } from '../middleware/HttpError';
import { computeBalances, EMPTY_BALANCE } from './classSchedule.service';

// ── Onboarding: professor <-> complex linking ──────────────────────────────

export async function requestComplexLink(professorId: string, complexId: string) {
  const complex = await prisma.complex.findUnique({ where: { id: complexId } });
  if (!complex) {
    throw new HttpError(404, 'Complejo no encontrado.');
  }

  const existingLink = await prisma.professorComplex.findUnique({
    where: { professorId_complexId: { professorId, complexId } },
  });
  if (existingLink && existingLink.active) {
    throw new HttpError(409, 'Ya eres un profesor vinculado activamente a este complejo.');
  }

  const existingRequest = await prisma.professorRequest.findFirst({
    where: { professorId, complexId, status: 'PENDING' },
  });
  if (existingRequest) {
    throw new HttpError(409, 'Ya tienes una solicitud pendiente para este complejo.');
  }

  return prisma.professorRequest.create({
    data: { professorId, complexId, status: 'PENDING' },
    include: { complex: true },
  });
}

export async function getProfessorComplexesAndRequests(professorId: string) {
  const approvedLinks = await prisma.professorComplex.findMany({
    where: { professorId, active: true },
    include: {
      complex: {
        include: {
          courts: { where: { active: true } },
          owner: { select: { name: true, phone: true } },
        },
      },
    },
  });

  const requests = await prisma.professorRequest.findMany({
    where: { professorId },
    include: { complex: true },
    orderBy: { requestedAt: 'desc' },
  });

  return { approvedComplexes: approvedLinks.map((l) => l.complex), requests };
}

export async function getComplexProfessorRequests(complexId: string) {
  return prisma.professorRequest.findMany({
    where: { complexId },
    include: { professor: { select: { id: true, name: true, email: true, phone: true } } },
    orderBy: { requestedAt: 'desc' },
  });
}

export async function resolveProfessorRequest(requestId: string, status: ProfessorRequestStatus) {
  const request = await prisma.professorRequest.findUnique({ where: { id: requestId } });
  if (!request) {
    throw new HttpError(404, 'Solicitud no encontrada.');
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.professorRequest.update({
      where: { id: requestId },
      data: { status, resolvedAt: new Date() },
    });

    if (status === 'APPROVED') {
      await tx.professorComplex.upsert({
        where: { professorId_complexId: { professorId: request.professorId, complexId: request.complexId } },
        create: { professorId: request.professorId, complexId: request.complexId, active: true },
        update: { active: true },
      });
    }

    return updated;
  });
}

// ── Students ────────────────────────────────────────────────────────────

export interface StudentInput {
  name: string;
  phone: string;
  email?: string;
  notes?: string;
}

function assertOwnsStudent<T extends { professorId: string } | null>(
  student: T,
  professorId: string
): asserts student is NonNullable<T> {
  if (!student || student.professorId !== professorId) {
    throw new HttpError(404, 'Alumno no encontrado.');
  }
}

/** Active students with their balance (paid − owed for the classes they took). */
export async function listStudentsWithBalance(professorId: string) {
  const students = await prisma.student.findMany({ where: { professorId, active: true }, orderBy: { name: 'asc' } });
  const { balances } = await computeBalances(professorId);
  return students.map((student) => ({ ...student, balance: balances.get(student.id) ?? EMPTY_BALANCE }));
}

export async function createStudent(professorId: string, input: StudentInput) {
  return prisma.student.create({
    data: {
      professorId,
      name: input.name.trim(),
      phone: input.phone.trim(),
      email: input.email?.trim() || null,
      notes: input.notes?.trim() || null,
    },
  });
}

export async function updateStudent(studentId: string, professorId: string, input: Partial<StudentInput>) {
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  assertOwnsStudent(student, professorId);

  return prisma.student.update({
    where: { id: studentId },
    data: {
      ...(input.name ? { name: input.name.trim() } : {}),
      ...(input.phone ? { phone: input.phone.trim() } : {}),
      ...(input.email !== undefined ? { email: input.email?.trim() || null } : {}),
      ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
    },
  });
}

/** Soft delete — keeps the student's payments and class charges intact. */
export async function deleteStudent(studentId: string, professorId: string): Promise<void> {
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  assertOwnsStudent(student, professorId);

  await prisma.student.update({ where: { id: studentId }, data: { active: false } });
}
