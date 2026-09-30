import type {
  Complex,
  ComplexSummary,
  Court,
  FixedBooking,
  Closure,
  PriceRule,
  Turn,
  PublicTurn,
  OwnerTurn,
  Reservation,
  FixedBookingConflict,
  OwnerReservationView,
  MyReservation,
  OpenMatchSummary,
  OpenMatchInput,
  Payment,
  Student,
  StudentWithBalance,
  ClassSchedule,
  WeeklyClass,
  StudentAccount,
  ProfessorRequest,
  UserRole,
  ComplexAnalytics,
  ProfessorAnalytics,
} from '../types';
import type { User } from '../context/AuthContext';

const BASE_URL = '/api';

export class ApiError extends Error {
  status: number;
  data: any;

  constructor(status: number, message: string, data?: any) {
    super(message);
    this.status = status;
    this.data = data;
    this.name = 'ApiError';
  }
}

/** Status 0: the request never got an HTTP answer (offline, server down, CORS). */
export const NETWORK_ERROR_STATUS = 0;

/** Fired when the session expired mid-use, so the app can sign the user out. */
export const SESSION_EXPIRED_EVENT = 'tuturnito:session-expired';

/**
 * The message shown to the user for a failed request. The server's own text
 * is kept when it's meant for people (business rules, validation); generic or
 * technical cases get a clear message per status code instead.
 */
function friendlyMessage(status: number, data: any): string {
  const serverMsg: string | null = data && typeof data === 'object' ? data.error || data.message || null : null;

  switch (true) {
    case status === 401:
      return !serverMsg || serverMsg.startsWith('No autenticado')
        ? 'Tu sesión venció o no iniciaste sesión. Ingresá de nuevo para continuar.'
        : serverMsg; // e.g. wrong email or password
    case status === 403:
      return serverMsg || 'No tenés permiso para hacer esta acción.';
    case status === 404:
      return serverMsg && !serverMsg.startsWith('Ruta ')
        ? serverMsg
        : 'No encontramos lo que buscabas. Puede que se haya eliminado.';
    case status === 413:
      return serverMsg || 'Los datos enviados son demasiado grandes.';
    case status === 429:
      return serverMsg || 'Demasiadas solicitudes seguidas. Esperá un momento y probá de nuevo.';
    // Our API always explains its own 500s: one without a message (or a
    // gateway error) came from a proxy because the server didn't answer.
    case status === 502 || status === 503 || status === 504 || (status >= 500 && !serverMsg):
      return 'El servidor no está disponible en este momento. Probá de nuevo en unos minutos.';
    case status >= 500:
      return serverMsg!;
    default:
      return serverMsg || `No se pudo completar la solicitud (error ${status}).`;
  }
}

async function request<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include', // Sends & receives httpOnly cookies
    });
  } catch {
    throw new ApiError(NETWORK_ERROR_STATUS, 'No hay conexión con el servidor. Revisá tu conexión a internet y probá de nuevo.');
  }

  const contentType = response.headers.get('content-type');
  let data: any = null;

  try {
    data = contentType && contentType.includes('application/json') ? await response.json() : await response.text();
  } catch {
    data = null;
  }

  if (!response.ok) {
    // A 401 outside the auth endpoints means the session expired while in use.
    if (response.status === 401 && !endpoint.startsWith('/auth/')) {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    throw new ApiError(response.status, friendlyMessage(response.status, data), data);
  }

  return data as T;
}

interface RegisterInput {
  name: string;
  email: string;
  password: string;
  phone?: string;
  role: UserRole;
}

interface UpdateProfileInput {
  name?: string;
  email?: string;
  phone?: string;
  emailReminders?: boolean;
}

interface AuthResponse {
  message: string;
  user: User;
  token: string;
}

interface SaveCourtsResult {
  message: string;
  success: boolean;
  /** Fixed bookings ended because their slot no longer exists. */
  deactivatedFixedBookings: FixedBookingConflict[];
}

export interface CourtInput {
  id?: string;
  name: string;
  order?: number;
  openTime: string;
  closeTime: string;
  slotMinutes: number;
  basePrice: number;
}

export interface ReservationStats {
  totalReservations: number;
  totalCollected: number;
  totalPending: number;
}

interface CreateReservationResponse {
  message: string;
  reservation: Reservation;
  turn: Turn;
  payment: Payment;
}

export const api = {
  // Auth
  auth: {
    register: (body: RegisterInput) => request<AuthResponse>('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
    login: (body: { email: string; password: string }) =>
      request<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
    logout: () => request<{ message: string }>('/auth/logout', { method: 'POST' }),
    me: () => request<{ user: User }>('/auth/me'),
    updateProfile: (body: UpdateProfileInput) =>
      request<{ message: string; user: User }>('/auth/me', { method: 'PUT', body: JSON.stringify(body) }),
  },

  // Complexes
  complexes: {
    list: (params?: { search?: string; location?: string }) => {
      const q = new URLSearchParams();
      if (params?.search) q.append('search', params.search);
      if (params?.location) q.append('location', params.location);
      const qs = q.toString() ? `?${q.toString()}` : '';
      return request<{ complexes: ComplexSummary[] }>(`/complexes${qs}`);
    },
    /** Accepts the complex id or its public slug. */
    getById: (idOrSlug: string) => request<{ complex: Complex }>(`/complexes/${encodeURIComponent(idOrSlug)}`),
    create: (body: Partial<Complex>) =>
      request<{ message: string; complex: Complex }>('/complexes', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: Partial<Omit<Complex, 'courts'>>) =>
      request<{ message: string; complex: Complex }>(`/complexes/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  },

  // Schedules (Panel de Reservas: courts, their ranges and the owner grid)
  schedules: {
    get: (complexId: string) =>
      request<{ courts: Court[]; fixedBookings: FixedBooking[] }>(`/complexes/${complexId}/schedule`),
    saveCourts: (complexId: string, payload: { courts: CourtInput[]; resolveConflicts?: 'KEEP' | 'CANCEL' }) =>
      request<SaveCourtsResult>(`/complexes/${complexId}/courts`, { method: 'PUT', body: JSON.stringify(payload) }),
    getOwnerTurns: (complexId: string, fromDate: string, toDate: string) =>
      request<{ courts: Court[]; turns: OwnerTurn[] }>(`/complexes/${complexId}/owner-turns?from=${fromDate}&to=${toDate}`),
  },

  // Turns & Public Calendar
  turns: {
    getByDateRange: (complexId: string, fromDate: string, toDate: string) =>
      request<{ turns: PublicTurn[] }>(`/complexes/${complexId}/turns?from=${fromDate}&to=${toDate}`),
    update: (
      complexId: string,
      turnId: string,
      body: { state?: 'AVAILABLE' | 'BLOCKED' | 'TOURNAMENT'; price?: number; label?: string | null }
    ) =>
      request<{ message: string; turn: Turn }>(`/complexes/${complexId}/turns/${turnId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
  },

  // Fixed bookings (turnos fijos)
  fixedBookings: {
    list: (complexId: string) => request<{ fixedBookings: FixedBooking[] }>(`/complexes/${complexId}/fixed-bookings`),
    create: (
      complexId: string,
      body: { courtId: string; dayOfWeek: number; startTime: string; guestName: string; guestPhone: string; notes?: string; startDate?: string; endDate?: string }
    ) =>
      request<{ message: string; fixedBooking: FixedBooking; skippedDates: string[] }>(`/complexes/${complexId}/fixed-bookings`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    remove: (complexId: string, fixedBookingId: string, cancelFuture: boolean) =>
      request<{ message: string }>(`/complexes/${complexId}/fixed-bookings/${fixedBookingId}?cancelFuture=${cancelFuture}`, {
        method: 'DELETE',
      }),
  },

  // Analytics (owner and professor dashboards)
  analytics: {
    complex: (complexId: string, from: string, to: string) =>
      request<ComplexAnalytics>(`/complexes/${complexId}/analytics?from=${from}&to=${to}`),
    professor: (from: string, to: string) => request<ProfessorAnalytics>(`/professors/analytics?from=${from}&to=${to}`),
  },

  // Price rules (precios por franja: peak hours, promos)
  priceRules: {
    list: (complexId: string) => request<{ rules: PriceRule[] }>(`/complexes/${complexId}/price-rules`),
    /** Replaces every rule of the complex and re-prices the upcoming free turns. */
    save: (complexId: string, rules: Omit<PriceRule, 'id' | 'court'>[]) =>
      request<{ message: string; rules: PriceRule[] }>(`/complexes/${complexId}/price-rules`, {
        method: 'PUT',
        body: JSON.stringify({ rules }),
      }),
  },

  // Closures (feriados / cierres: every court blocked for a date range)
  closures: {
    list: (complexId: string) => request<{ closures: Closure[] }>(`/complexes/${complexId}/closures`),
    /** 409 with `data.conflicts` (ClosureConflict[]) when there are reservations on those days and cancelConflicts isn't set. */
    create: (complexId: string, body: { startDate: string; endDate: string; reason: string; cancelConflicts?: boolean }) =>
      request<{ message: string; closure: Closure; cancelled: number }>(`/complexes/${complexId}/closures`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    remove: (complexId: string, closureId: string) =>
      request<{ message: string }>(`/complexes/${complexId}/closures/${closureId}`, { method: 'DELETE' }),
  },

  // Reservations
  reservations: {
    create: (
      turnId: string,
      body: { guestName: string; guestPhone: string; guestEmail?: string; type?: 'PLAYER' | 'CLASS'; notes?: string; openMatch?: OpenMatchInput }
    ) =>
      request<CreateReservationResponse>(`/turns/${turnId}/reservations`, { method: 'POST', body: JSON.stringify(body) }),
    cancel: (id: string) => request<{ message: string }>(`/reservations/${id}`, { method: 'DELETE' }),
    getComplexReservations: (complexId: string, range?: { from: string; to: string }) =>
      request<{ reservations: OwnerReservationView[]; stats: ReservationStats }>(
        `/complexes/${complexId}/reservations${range ? `?from=${range.from}&to=${range.to}` : ''}`
      ),
    updatePayment: (reservationId: string, body: { status: 'PAID' | 'PENDING'; amount?: number }) =>
      request<{ message: string; payment: Payment }>(`/reservations/${reservationId}/payment`, { method: 'PUT', body: JSON.stringify(body) }),
    getMyReservations: () => request<{ reservations: MyReservation[] }>('/reservations/my'),
    /** "Me faltan jugadores": publish / edit / unpublish my booking as an open match. */
    openMatch: (reservationId: string, body: OpenMatchInput) =>
      request<{ message: string }>(`/reservations/${reservationId}/open-match`, { method: 'POST', body: JSON.stringify(body) }),
    updateOpenMatch: (reservationId: string, body: OpenMatchInput) =>
      request<{ message: string }>(`/reservations/${reservationId}/open-match`, { method: 'PATCH', body: JSON.stringify(body) }),
    closeOpenMatch: (reservationId: string) =>
      request<{ message: string }>(`/reservations/${reservationId}/open-match`, { method: 'DELETE' }),
  },

  // Open matches (partidos abiertos: players joining a booking that's missing players)
  openMatches: {
    list: (params: { complexId?: string; location?: string; date?: string; category?: string } = {}) => {
      const q = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => v && q.append(k, v));
      const qs = q.toString() ? `?${q.toString()}` : '';
      return request<{ matches: OpenMatchSummary[]; categories: string[] }>(`/open-matches${qs}`);
    },
    join: (matchId: string) => request<{ message: string }>(`/open-matches/${matchId}/join`, { method: 'POST' }),
    leave: (matchId: string) => request<{ message: string }>(`/open-matches/${matchId}/join`, { method: 'DELETE' }),
    removePlayer: (matchId: string, userId: string) =>
      request<{ message: string }>(`/open-matches/${matchId}/players/${userId}`, { method: 'DELETE' }),
  },

  // Professors
  professors: {
    sendRequest: (complexId: string) =>
      request<{ message: string; request: ProfessorRequest }>('/professors/requests', { method: 'POST', body: JSON.stringify({ complexId }) }),
    getMyComplexes: () => request<{ approvedComplexes: Complex[]; requests: ProfessorRequest[] }>('/professors/my-complexes'),
    getComplexRequests: (complexId: string) => request<{ requests: ProfessorRequest[] }>(`/professors/complexes/${complexId}/professor-requests`),
    resolveRequest: (complexId: string, requestId: string, status: 'APPROVED' | 'REJECTED') =>
      request<{ message: string; request: ProfessorRequest }>(`/professors/complexes/${complexId}/professor-requests/${requestId}`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      }),
    getStudents: () => request<{ students: StudentWithBalance[] }>('/professors/students'),
    createStudent: (body: { name: string; phone: string; email?: string; notes?: string }) =>
      request<{ message: string; student: Student }>('/professors/students', { method: 'POST', body: JSON.stringify(body) }),
    updateStudent: (studentId: string, body: Partial<{ name: string; phone: string; email: string; notes: string }>) =>
      request<{ message: string; student: Student }>(`/professors/students/${studentId}`, { method: 'PUT', body: JSON.stringify(body) }),
    deleteStudent: (studentId: string) => request<{ message: string }>(`/professors/students/${studentId}`, { method: 'DELETE' }),

    // Class schedules: a court booked on several weekdays within a time window
    getClassSchedules: () => request<{ schedules: ClassSchedule[] }>('/professors/class-schedules'),
    createClassSchedule: (body: { complexId: string; courtId: string; daysOfWeek: number[]; startTime: string; endTime: string }) =>
      request<{ message: string; schedule: ClassSchedule; skipped: { date: string; startTime: string }[] }>('/professors/class-schedules', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    deleteClassSchedule: (scheduleId: string) =>
      request<{ message: string }>(`/professors/class-schedules/${scheduleId}`, { method: 'DELETE' }),

    // Weekly class grid, enrollments and student accounts
    getWeeklyClasses: () => request<{ classes: WeeklyClass[]; students: StudentWithBalance[] }>('/professors/weekly-classes'),
    addEnrollment: (body: {
      classScheduleId: string;
      dayOfWeek: number;
      startTime: string;
      price: number;
      studentId?: string;
      newStudent?: { name: string; phone: string };
    }) => request<{ message: string }>('/professors/enrollments', { method: 'POST', body: JSON.stringify(body) }),
    updateEnrollmentPrice: (enrollmentId: string, price: number) =>
      request<{ message: string }>(`/professors/enrollments/${enrollmentId}`, { method: 'PUT', body: JSON.stringify({ price }) }),
    removeEnrollment: (enrollmentId: string) =>
      request<{ message: string }>(`/professors/enrollments/${enrollmentId}`, { method: 'DELETE' }),
    markAbsent: (enrollmentId: string, date: string) =>
      request<{ message: string }>(`/professors/enrollments/${enrollmentId}/absences`, { method: 'POST', body: JSON.stringify({ date }) }),
    unmarkAbsent: (enrollmentId: string, date: string) =>
      request<{ message: string }>(`/professors/enrollments/${enrollmentId}/absences/${date}`, { method: 'DELETE' }),
    getStudentAccount: (studentId: string) => request<StudentAccount>(`/professors/students/${studentId}/account`),
    createStudentPayment: (studentId: string, body: { amount: number; date?: string; notes?: string }) =>
      request<{ message: string; payment: Payment }>(`/professors/students/${studentId}/payments`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    deleteStudentPayment: (paymentId: string) => request<{ message: string }>(`/professors/payments/${paymentId}`, { method: 'DELETE' }),
  },
};
