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
} from '../services/professor.service';
import {
  listClassSchedules,
  createClassSchedule,
  deleteClassSchedule,
  getWeeklyClasses,
  addEnrollment,
  updateEnrollmentPrice,
  removeEnrollment,
  getStudentAccount,
  createStudentPayment,
  deleteStudentPayment,
  markAbsent,
  unmarkAbsent,
  absenceSchema,
  classScheduleCreateSchema,
  enrollmentCreateSchema,
  enrollmentUpdateSchema,
  studentPaymentSchema,
} from '../services/classSchedule.service';

const router = Router();

const studentSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  phone: z.string().min(6, 'El teléfono es requerido'),
  email: z.string().email().optional().or(z.literal('')),
  notes: z.string().optional(),
});

const professorOnly = [requireAuth, requireRole('PROFESOR')];

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

// GET /api/professors/students (List professor students with their balance)
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

// DELETE /api/professors/students/:studentId (Soft delete student, keeps payments and charges)
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

// GET /api/professors/class-schedules (Professor's recurring court bookings)
router.get(
  '/class-schedules',
  ...professorOnly,
  asyncHandler(async (req: Request, res: Response) => {
    const schedules = await listClassSchedules(req.user!.id);
    return res.json({ schedules });
  }, 'Error al obtener los horarios de clases.')
);

// POST /api/professors/class-schedules (Book a court on several weekdays within a time window)
router.post(
  '/class-schedules',
  ...professorOnly,
  validate(classScheduleCreateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await createClassSchedule(req.user!.id, req.body);
    return res.status(201).json({ message: 'Horario de clases reservado.', ...result });
  }, 'Error al reservar el horario de clases.')
);

// DELETE /api/professors/class-schedules/:scheduleId (Ends it: frees upcoming classes)
router.delete(
  '/class-schedules/:scheduleId',
  ...professorOnly,
  asyncHandler(async (req: Request, res: Response) => {
    await deleteClassSchedule(req.user!.id, req.params.scheduleId as string);
    return res.json({ message: 'Horario de clases eliminado y próximas clases liberadas.' });
  }, 'Error al eliminar el horario de clases.')
);

// GET /api/professors/weekly-classes (Weekly grid: classes with their students and balances)
router.get(
  '/weekly-classes',
  ...professorOnly,
  asyncHandler(async (req: Request, res: Response) => {
    const data = await getWeeklyClasses(req.user!.id);
    return res.json(data);
  }, 'Error al obtener la grilla de clases.')
);

// POST /api/professors/enrollments (Add a student, existing or new, to a class)
router.post(
  '/enrollments',
  ...professorOnly,
  validate(enrollmentCreateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const enrollment = await addEnrollment(req.user!.id, req.body);
    return res.status(201).json({ message: 'Alumno agregado a la clase.', enrollment });
  }, 'Error al agregar el alumno a la clase.')
);

// PUT /api/professors/enrollments/:enrollmentId (Change what the student pays per class)
router.put(
  '/enrollments/:enrollmentId',
  ...professorOnly,
  validate(enrollmentUpdateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const enrollment = await updateEnrollmentPrice(req.user!.id, req.params.enrollmentId as string, req.body.price);
    return res.json({ message: 'Valor actualizado.', enrollment });
  }, 'Error al actualizar el valor de la clase.')
);

// DELETE /api/professors/enrollments/:enrollmentId (Remove the student from the class from today on)
router.delete(
  '/enrollments/:enrollmentId',
  ...professorOnly,
  asyncHandler(async (req: Request, res: Response) => {
    await removeEnrollment(req.user!.id, req.params.enrollmentId as string);
    return res.json({ message: 'Alumno quitado de la clase.' });
  }, 'Error al quitar el alumno de la clase.')
);

// POST /api/professors/enrollments/:enrollmentId/absences (Student missed / will miss that date: not charged)
router.post(
  '/enrollments/:enrollmentId/absences',
  ...professorOnly,
  validate(absenceSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const absence = await markAbsent(req.user!.id, req.params.enrollmentId as string, req.body.date);
    return res.status(201).json({ message: 'Ausencia registrada: esa clase no se cobra.', absence });
  }, 'Error al registrar la ausencia.')
);

// DELETE /api/professors/enrollments/:enrollmentId/absences/:date (Undo an absence)
router.delete(
  '/enrollments/:enrollmentId/absences/:date',
  ...professorOnly,
  asyncHandler(async (req: Request, res: Response) => {
    await unmarkAbsent(req.user!.id, req.params.enrollmentId as string, req.params.date as string);
    return res.json({ message: 'Ausencia eliminada.' });
  }, 'Error al eliminar la ausencia.')
);

// GET /api/professors/students/:studentId/account (Balance, charged classes and payments)
router.get(
  '/students/:studentId/account',
  ...professorOnly,
  asyncHandler(async (req: Request, res: Response) => {
    const account = await getStudentAccount(req.user!.id, req.params.studentId as string);
    return res.json(account);
  }, 'Error al obtener la cuenta del alumno.')
);

// POST /api/professors/students/:studentId/payments (Record a payment received from the student)
router.post(
  '/students/:studentId/payments',
  ...professorOnly,
  validate(studentPaymentSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const payment = await createStudentPayment(req.user!.id, req.params.studentId as string, req.body);
    return res.status(201).json({ message: 'Cobro registrado.', payment });
  }, 'Error al registrar el cobro.')
);

// DELETE /api/professors/payments/:paymentId (Delete a payment recorded by mistake)
router.delete(
  '/payments/:paymentId',
  ...professorOnly,
  asyncHandler(async (req: Request, res: Response) => {
    await deleteStudentPayment(req.user!.id, req.params.paymentId as string);
    return res.json({ message: 'Cobro eliminado.' });
  }, 'Error al eliminar el cobro.')
);

export default router;
