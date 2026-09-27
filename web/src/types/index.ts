// Shared domain types, mirroring exactly what the backend routes return
// (see server/src/services/*.service.ts and server/src/routes/*.routes.ts).
// Single source of truth for these shapes instead of each page/component
// redefining its own ad hoc `any`-typed version.

export type UserRole = 'JUGADOR' | 'DUEÑO' | 'PROFESOR';
export type TurnState = 'AVAILABLE' | 'OCCUPIED' | 'BLOCKED' | 'TOURNAMENT';
export type ReservationType = 'PLAYER' | 'CLASS';
export type PaymentStatus = 'PAID' | 'PENDING';
export type PayableType = 'RESERVATION' | 'STUDENT_CLASS';
export type ProfessorRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface Court {
  id: string;
  complexId?: string;
  name: string;
  order: number;
  active?: boolean;
  /** Rango horario: turns run from openTime to closeTime in slotMinutes blocks, every day. */
  openTime: string;
  closeTime: string;
  slotMinutes: number;
  basePrice: number;
}

/** GET /api/complexes/:id/schedule — a weekly fixed booking (turno fijo). */
export interface FixedBooking {
  id: string;
  complexId: string;
  courtId: string;
  court?: { id: string; name: string };
  dayOfWeek: number;
  startTime: string;
  guestName: string;
  guestPhone: string;
  notes: string | null;
  startDate: string;
  endDate: string | null;
  active: boolean;
}

/** The public catalog card shape from GET /api/complexes. */
export interface ComplexSummary {
  id: string;
  name: string;
  location: string;
  address: string;
  description: string | null;
  phone: string | null;
  openingHours: string | null;
  imageUrl: string | null;
  courtCount: number;
  minPrice: number | null;
  maxPrice: number | null;
  owner: { id: string; name: string; phone: string | null };
}

/** The full complex shape from GET /api/complexes/:id and POST/PUT /api/complexes. */
export interface Complex {
  id: string;
  name: string;
  location: string;
  address: string;
  description: string | null;
  phone: string | null;
  openingHours: string | null;
  timezone: string;
  imageUrl: string | null;
  ownerId: string;
  owner?: { id: string; name: string; phone: string | null; email?: string };
  courts: Court[];
  createdAt?: string;
  updatedAt?: string;
}

export interface TurnReservationSummary {
  id: string;
  guestName: string;
  guestPhone?: string;
  type: ReservationType;
  notes?: string | null;
  fixedBookingId?: string | null;
  user?: { id: string; name: string; email: string; phone: string | null } | null;
  professor?: { id: string; name: string; email: string } | null;
}

export interface Turn {
  id: string;
  courtId: string;
  date: string;
  startTime: string;
  endTime: string;
  price: number;
  state: TurnState;
  label?: string | null;
  manualOverride?: boolean;
  court: { id: string; name: string };
  reservation?: TurnReservationSummary | null;
}

/** GET /api/complexes/:id/owner-turns — a turn in the owner's grid, reservation joined with its payment. */
export interface OwnerTurn extends Turn {
  reservation?:
    | (TurnReservationSummary & { paymentStatus: PaymentStatus; paymentAmount: number; paymentId?: string })
    | null;
}

/** The raw row shape returned directly by POST /api/turns/:turnId/reservations (not the formatted owner/player views below). */
export interface Reservation {
  id: string;
  turnId: string;
  complexId: string;
  userId: string | null;
  guestName: string;
  guestPhone: string;
  guestEmail: string | null;
  type: ReservationType;
  professorId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleConflict {
  reservationId: string;
  courtName: string;
  date: string;
  time: string;
  guestName: string;
  type: ReservationType;
}

export interface Payment {
  id: string;
  payableType: PayableType;
  payableId: string;
  amount: number;
  status: PaymentStatus;
  date: string;
  recordedById: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** GET /api/professors/payments — a Payment joined with its student's name/phone. */
export interface ProfessorPaymentView extends Payment {
  studentName: string;
  studentPhone?: string;
}

/** GET /api/complexes/:id/reservations — the owner's reservations+payments view. */
export interface OwnerReservationView {
  id: string;
  turnId: string;
  date: string;
  time: string;
  courtName: string;
  guestName: string;
  guestPhone: string;
  guestEmail: string | null;
  type: ReservationType;
  fixedBookingId: string | null;
  user: { id: string; name: string; email: string; phone: string | null } | null;
  professor: { id: string; name: string; phone: string | null } | null;
  price: number;
  paymentStatus: PaymentStatus;
  paymentAmount: number;
  paymentId?: string;
  createdAt: string;
}

/** GET /api/reservations/my — "Mis reservas" for the logged-in player. */
export interface MyReservation {
  id: string;
  complexId: string;
  complexName: string;
  complexAddress: string;
  complexPhone: string | null;
  courtName: string;
  date: string;
  startTime: string;
  endTime: string;
  price: number;
  type: ReservationType;
  paymentStatus: PaymentStatus;
  isPast: boolean;
  createdAt: string;
}

export interface Student {
  id: string;
  professorId: string;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** GET /api/professors/students — a Student with its running payment balance. */
export interface StudentWithBalance extends Student {
  totalPaid: number;
  totalPending: number;
  paymentCount: number;
}

export interface ProfessorRequest {
  id: string;
  professorId: string;
  complexId: string;
  status: ProfessorRequestStatus;
  requestedAt: string;
  resolvedAt: string | null;
  complex?: Complex;
  professor?: { id: string; name: string; email: string; phone: string | null };
}

export interface ClassReservation {
  id: string;
  complexId: string;
  turnId: string;
  guestName: string;
  guestPhone: string;
  type: 'CLASS';
  complex: Complex;
  turn: Turn;
  notes: string | null;
  createdAt: string;
}

export interface ProfessorHistorySummary {
  totalClasses: number;
  upcomingClassesCount: number;
  pastClassesCount: number;
  studentsCount: number;
  totalCollected: number;
  totalPending: number;
}

export interface ProfessorHistory {
  summary: ProfessorHistorySummary;
  upcomingClasses: ClassReservation[];
  pastClasses: ClassReservation[];
}
