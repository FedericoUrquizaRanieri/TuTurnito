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

/** GET/PUT /api/complexes/:id/price-rules — turns starting in [startTime, endTime) on those days cost `price`. */
export interface PriceRule {
  id?: string;
  /** null = every court; a court rule wins over an all-courts rule. */
  courtId: string | null;
  court?: { id: string; name: string } | null;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  price: number;
  label?: string | null;
}

/** GET /api/complexes/:id/closures — the whole complex closed from startDate to endDate (inclusive). */
export interface Closure {
  id: string;
  complexId: string;
  startDate: string;
  endDate: string;
  reason: string;
}

/** An upcoming reservation that a new closure would cancel (409 from POST /closures). */
export interface ClosureConflict {
  reservationId: string;
  courtName: string;
  date: string;
  time: string;
  guestName: string;
  type: ReservationType;
  isRecurring: boolean;
}

/** The public catalog card shape from GET /api/complexes. */
export interface ComplexSummary {
  id: string;
  /** Public URL: /<slug> */
  slug: string;
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
  /** Public URL: /<slug> */
  slug: string;
  name: string;
  location: string;
  address: string;
  description: string | null;
  phone: string | null;
  openingHours: string | null;
  timezone: string;
  imageUrl: string | null;
  /** Players can cancel from the app up to this many hours before the turn (0 = until it starts). */
  cancellationHours?: number;
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
  classScheduleId?: string | null;
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
  /** Set when a complex closure (holiday, maintenance) blocked this turn. */
  closureId?: string | null;
  /** The public turns endpoint returns the whole court (basePrice included, used for the "Promo" tag). */
  court: { id: string; name: string; basePrice?: number };
  reservation?: TurnReservationSummary | null;
}

/** GET /api/complexes/:id/owner-turns — a turn in the owner's grid, reservation joined with its payment. */
export interface OwnerTurn extends Turn {
  reservation?:
    | (TurnReservationSummary & {
        paymentStatus: PaymentStatus;
        paymentAmount: number;
        paymentId?: string;
        /** The booker is looking for players ("partido abierto"). */
        openMatch?: { spots: number; joinedCount: number; category: string | null; players: { name: string; phone: string | null }[] } | null;
      })
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

/** A professor's class schedule that a courts change would break (blocks the save). */
export interface ClassScheduleConflict {
  classScheduleId: string;
  professorName: string;
  courtName: string;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
}

/** A fixed booking whose slot disappears with a courts change (ended when the change is confirmed). */
export interface FixedBookingConflict {
  fixedBookingId: string;
  courtName: string;
  dayOfWeek: number;
  startTime: string;
  guestName: string;
}

export type CourtsConflictType = 'CLASS_SCHEDULES' | 'COURT_DELETION' | 'RANGE_CHANGE';

export interface CourtsConflictData {
  conflictType: CourtsConflictType;
  conflicts: ScheduleConflict[];
  classSchedules: ClassScheduleConflict[];
  fixedBookings: FixedBookingConflict[];
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
  /** Null for matches I joined (the payment is the organizer's). */
  paymentStatus: PaymentStatus | null;
  isPast: boolean;
  /** The complex's policy: players cancel from the app up to this many hours before (0 = until it starts). */
  cancellationHours: number;
  /** Local date and time until which the player can cancel from the app. */
  cancelDeadline: { date: string; time: string };
  canCancel: boolean;
  /** BOOKER: I made the reservation. PLAYER_JOINED: I joined its open match. */
  role: 'BOOKER' | 'PLAYER_JOINED';
  openMatch: MyOpenMatch | null;
  createdAt: string;
}

/** The open match of a reservation, as seen by its organizer and players (contacts included). */
export interface MyOpenMatch {
  id: string;
  spots: number;
  joinedCount: number;
  category: string | null;
  notes: string | null;
  organizer: { name: string; phone: string };
  players: { userId: string; name: string; phone: string | null }[];
}

/** GET /api/open-matches — a public open match ("faltan N") with room left. */
export interface OpenMatchSummary {
  id: string;
  complex: { id: string; name: string; slug: string; location: string; address: string };
  courtName: string;
  date: string;
  startTime: string;
  endTime: string;
  price: number;
  pricePerPlayer: number;
  spots: number;
  joinedCount: number;
  spotsLeft: number;
  category: string | null;
  notes: string | null;
  organizerName: string;
  /** The viewer already joined / is the organizer (only when logged in). */
  joined: boolean;
  isOrganizer: boolean;
}

export interface OpenMatchInput {
  spots: number;
  category?: string | null;
  notes?: string | null;
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

/** A student's account with the professor: paid − owed for the classes already given. */
export interface StudentBalance {
  paid: number;
  owed: number;
  balance: number;
  classesCharged: number;
}

/** GET /api/professors/students — a Student with its balance. */
export interface StudentWithBalance extends Student {
  balance: StudentBalance;
}

/** A professor's recurring court booking: one court, several weekdays, a time window. */
export interface ClassSchedule {
  id: string;
  professorId: string;
  complexId: string;
  courtId: string;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  startDate: string;
  court: { id: string; name: string };
  complex: { id: string; name: string; slug: string };
}

export interface ClassStudent {
  enrollmentId: string;
  studentId: string;
  name: string;
  phone: string;
  /** What this student pays per class. */
  price: number;
  balance: StudentBalance;
}

/** GET /api/professors/weekly-classes — one class of the weekly grid (schedule × weekday × turn). */
export interface WeeklyClass {
  key: string;
  classScheduleId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  court: { id: string; name: string };
  complex: { id: string; name: string; slug: string };
  students: ClassStudent[];
}

/** GET /api/professors/students/:id/account */
export interface StudentAccount {
  student: Student;
  balance: StudentBalance;
  charges: { enrollmentId: string; date: string; startTime: string; endTime: string; price: number }[];
  /** Classes the student missed (not charged), including ones marked ahead of time. */
  absences: { enrollmentId: string; date: string; startTime: string; price: number }[];
  payments: Payment[];
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

/** GET /api/complexes/:id/analytics — owner numbers for a date range (up to today). */
export interface ComplexAnalytics {
  range: { from: string; to: string; effectiveTo: string; granularity: 'day' | 'week' | 'month' };
  kpis: {
    occupancyPct: number;
    occupiedTurns: number;
    capacity: number;
    billed: number;
    collected: number;
    pending: number;
    reservations: number;
    avgTicket: number;
    cancellations: number;
    lateCancellations: number;
  };
  series: { key: string; label: string; revenue: number; collected: number; reservations: number; occupancyPct: number }[];
  byType: Record<'oneOff' | 'fixed' | 'classes', { count: number; revenue: number }>;
  heatmap: {
    hours: string[];
    days: { dayOfWeek: number; label: string; cells: { hour: string; capacity: number; occupied: number; pct: number | null }[] }[];
  };
  byCourt: { courtId: string; name: string; capacity: number; occupied: number; revenue: number; occupancyPct: number }[];
  topClients: { name: string; phone: string; lastDate: string; reservations: number; spent: number; owed: number }[];
  cancellations: {
    total: number;
    byLead: { under24h: number; from24to48h: number; over48h: number };
    byWho: { PLAYER: number; OWNER: number; PROFESSOR: number };
  };
}

/** GET /api/professors/analytics — a professor's numbers for a date range. */
export interface ProfessorAnalytics {
  range: { from: string; to: string; granularity: 'day' | 'week' | 'month' };
  kpis: {
    billed: number;
    collected: number;
    courtCost: number;
    margin: number;
    classesGiven: number;
    attendancePct: number;
    debtTotal: number;
    studentsOwing: number;
    activeStudents: number;
    newStudents: number;
    leftStudents: number;
    occupancyPct: number;
    freeSeats: number;
  };
  series: { key: string; label: string; billed: number; collected: number; courtCost: number; classesGiven: number }[];
  byComplex: { complexId: string; name: string; classesGiven: number; billed: number; courtCost: number }[];
  attendance: { studentId: string; name: string; attended: number; missed: number; pct: number }[];
  classesWithRoom: { complexName: string; courtName: string; dayOfWeek: number; dayLabel: string; startTime: string; enrolled: number; free: number }[];
  debtors: { studentId: string; name: string; phone: string; owes: number }[];
}
