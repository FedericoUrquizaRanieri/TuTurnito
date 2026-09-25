import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole, requireComplexOwner } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../middleware/asyncHandler';
import {
  requestComplexLink,
  getProfessorComplexesAndRequests,
  getComplexProfessorRequests,
  resolveProfessorRequest,
  listStudentsWithBalance,
  createStudent,
  updateStudent,
  deleteStudent,
  listProfessorPayments,
  createProfessorPayment,
  updateProfessorPayment,
  getProfessorHistory,
} from '../services/professor.service';

const router = Router();

const studentSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  phone: z.string().min(6, 'El teléfono es requerido'),
  email: z.string().email().optional().or(z.literal('')),
  notes: z.string().optional(),
});

const professorPaymentSchema = z.object({
  studentId: z.string().min(1, 'El alumno es requerido'),
  amount: z.number().positive('El monto debe ser mayor a 0'),
  status: z.enum(['PAID', 'PENDING']).default('PAID'),
  date: z.string().optional(),
  notes: z.string().optional(),
});

const professorPaymentUpdateSchema = z.object({
  status: z.enum(['PAID', 'PENDING']).optional(),
  amount: z.number().positive('El monto debe ser mayor a 0').optional(),
});

const complexLinkRequestSchema = z.object({
  complexId: z.string().min(1, 'ID de complejo requerido.'),
});

const resolveRequestSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED'], {
    errorMap: () => ({ message: 'El estado debe ser APPROVED o REJECTED.' }),
  }),
});

// POST /api/professors/requests (Professor requests to join a complex)
router.post(
  '/requests',
  requireAuth,
  requireRole('PROFESOR'),
  validate(complexLinkRequestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const request = await requestComplexLink(req.user!.id, req.body.complexId);
    return res.status(201).json({ message: 'Solicitud enviada al dueño del complejo.', request });
  }, 'Error al enviar solicitud al complejo.')
);

// GET /api/professors/my-complexes (Professor gets approved complexes & pending requests)
router.get(
  '/my-complexes',
  requireAuth,
  requireRole('PROFESOR'),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await getProfessorComplexesAndRequests(req.user!.id);
    return res.json(result);
  }, 'Error al obtener los complejos del profesor.')
);

// GET /api/complexes/:id/professor-requests (Owner views requests for their complex)
router.get(
  '/complexes/:id/professor-requests',
  requireAuth,
  requireRole('DUEÑO'),
  requireComplexOwner,
  asyncHandler(async (req: Request, res: Response) => {
    const requests = await getComplexProfessorRequests(req.params.id as string);
    return res.json({ requests });
  }, 'Error al obtener solicitudes de profesores.')
);

// PUT /api/complexes/:id/professor-requests/:requestId (Owner approves or rejects request)
router.put(
  '/complexes/:id/professor-requests/:requestId',
  requireAuth,
  requireRole('DUEÑO'),
  requireComplexOwner,
  validate(resolveRequestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const requestId = req.params.requestId as string;
    const { status } = req.body;
    const request = await resolveProfessorRequest(requestId, status);
    return res.json({
      message: `Solicitud ${status === 'APPROVED' ? 'aprobada' : 'rechazada'} exitosamente.`,
      request,
    });
  }, 'Error al procesar la solicitud.')
);

// GET /api/professors/students (List professor students with pending balance)
router.get(
  '/students',
  requireAuth,
  requireRole('PROFESOR'),
  asyncHandler(async (req: Request, res: Response) => {
    const students = await listStudentsWithBalance(req.user!.id);
    return res.json({ students });
  }, 'Error al obtener la lista de alumnos.')
);

// POST /api/professors/students (Add student)
router.post(
  '/students',
  requireAuth,
  requireRole('PROFESOR'),
  validate(studentSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const student = await createStudent(req.user!.id, req.body);
    return res.status(201).json({ message: 'Alumno agregado exitosamente.', student });
  }, 'Error al registrar alumno.')
);

// PUT /api/professors/students/:studentId (Update student)
router.put(
  '/students/:studentId',
  requireAuth,
  requireRole('PROFESOR'),
  validate(studentSchema.partial()),
  asyncHandler(async (req: Request, res: Response) => {
    const studentId = req.params.studentId as string;
    const student = await updateStudent(studentId, req.user!.id, req.body);
    return res.json({ message: 'Alumno actualizado exitosamente.', student });
  }, 'Error al actualizar alumno.')
);

// DELETE /api/professors/students/:studentId (Soft delete student, keeps payment history)
router.delete(
  '/students/:studentId',
  requireAuth,
  requireRole('PROFESOR'),
  asyncHandler(async (req: Request, res: Response) => {
    const studentId = req.params.studentId as string;
    await deleteStudent(studentId, req.user!.id);
    return res.json({ message: 'Alumno eliminado exitosamente. Su historial de cobros fue conservado.' });
  }, 'Error al eliminar alumno.')
);

// GET /api/professors/payments (Get professor student payments)
router.get(
  '/payments',
  requireAuth,
  requireRole('PROFESOR'),
  asyncHandler(async (req: Request, res: Response) => {
    const { studentId } = req.query;
    const payments = await listProfessorPayments(
      req.user!.id,
      typeof studentId === 'string' ? studentId : undefined
    );
    return res.json({ payments });
  }, 'Error al obtener los cobros.')
);

// POST /api/professors/payments (Register student payment)
router.post(
  '/payments',
  requireAuth,
  requireRole('PROFESOR'),
  validate(professorPaymentSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const payment = await createProfessorPayment(req.user!.id, req.body);
    return res.status(201).json({ message: 'Cobro registrado exitosamente.', payment });
  }, 'Error al registrar cobro.')
);

// PUT /api/professors/payments/:paymentId (Update payment status)
router.put(
  '/payments/:paymentId',
  requireAuth,
  requireRole('PROFESOR'),
  validate(professorPaymentUpdateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const paymentId = req.params.paymentId as string;
    const payment = await updateProfessorPayment(paymentId, req.user!.id, req.body);
    return res.json({ message: 'Cobro actualizado exitosamente.', payment });
  }, 'Error al actualizar cobro.')
);

// GET /api/professors/history (Professor class history & summary)
router.get(
  '/history',
  requireAuth,
  requireRole('PROFESOR'),
  asyncHandler(async (req: Request, res: Response) => {
    const history = await getProfessorHistory(req.user!.id);
    return res.json(history);
  }, 'Error al obtener el historial del profesor.')
);

export default router;
