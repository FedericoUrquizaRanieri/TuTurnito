import type {
  Complex,
  ComplexSummary,
  Court,
  FixedBooking,
  Turn,
  OwnerTurn,
  Reservation,
  ScheduleConflict,
  OwnerReservationView,
  MyReservation,
  Payment,
  Student,
  StudentWithBalance,
  ProfessorRequest,
  ProfessorPaymentView,
  ProfessorHistory,
  UserRole,
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

async function request<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include', // Sends & receives httpOnly cookies
  });

  const contentType = response.headers.get('content-type');
  let data: any = null;

  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const errorMsg = data?.error || data?.message || 'Error en la solicitud al servidor';
    throw new ApiError(response.status, errorMsg, data);
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
}

interface AuthResponse {
  message: string;
  user: User;
  token: string;
}

interface SaveCourtsResult {
  message: string;
  success?: boolean;
  hasConflicts?: boolean;
  conflictType?: 'COURT_DELETION' | 'RANGE_CHANGE';
  conflicts?: ScheduleConflict[];
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
    getById: (id: string) => request<{ complex: Complex }>(`/complexes/${id}`),
    create: (body: Partial<Complex>) =>
      request<{ message: string; complex: Complex }>('/complexes', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: Partial<Complex>) =>
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
      request<{ turns: Turn[] }>(`/complexes/${complexId}/turns?from=${fromDate}&to=${toDate}`),
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

  // Reservations
  reservations: {
    create: (turnId: string, body: { guestName: string; guestPhone: string; guestEmail?: string; type?: 'PLAYER' | 'CLASS'; notes?: string }) =>
      request<CreateReservationResponse>(`/turns/${turnId}/reservations`, { method: 'POST', body: JSON.stringify(body) }),
    cancel: (id: string) => request<{ message: string }>(`/reservations/${id}`, { method: 'DELETE' }),
    getComplexReservations: (complexId: string, range?: { from: string; to: string }) =>
      request<{ reservations: OwnerReservationView[]; stats: ReservationStats }>(
        `/complexes/${complexId}/reservations${range ? `?from=${range.from}&to=${range.to}` : ''}`
      ),
    updatePayment: (reservationId: string, body: { status: 'PAID' | 'PENDING'; amount?: number }) =>
      request<{ message: string; payment: Payment }>(`/reservations/${reservationId}/payment`, { method: 'PUT', body: JSON.stringify(body) }),
    getMyReservations: () => request<{ reservations: MyReservation[] }>('/reservations/my'),
  },

  // Professors
  professors: {
    sendRequest: (complexId: string) =>
      request<{ message: string; request: ProfessorRequest }>('/professors/requests', { method: 'POST', body: JSON.stringify({ complexId }) }),
    getMyComplexes: () => request<{ approvedComplexes: Complex[]; requests: ProfessorRequest[] }>('/professors/my-complexes'),
    getComplexRequests: (complexId: string) => request<{ requests: ProfessorRequest[] }>(`/complexes/${complexId}/professor-requests`),
    resolveRequest: (complexId: string, requestId: string, status: 'APPROVED' | 'REJECTED') =>
      request<{ message: string; request: ProfessorRequest }>(`/complexes/${complexId}/professor-requests/${requestId}`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      }),
    getStudents: () => request<{ students: StudentWithBalance[] }>('/professors/students'),
    createStudent: (body: { name: string; phone: string; email?: string; notes?: string }) =>
      request<{ message: string; student: Student }>('/professors/students', { method: 'POST', body: JSON.stringify(body) }),
    updateStudent: (studentId: string, body: Partial<{ name: string; phone: string; email: string; notes: string }>) =>
      request<{ message: string; student: Student }>(`/professors/students/${studentId}`, { method: 'PUT', body: JSON.stringify(body) }),
    deleteStudent: (studentId: string) => request<{ message: string }>(`/professors/students/${studentId}`, { method: 'DELETE' }),
    getPayments: (studentId?: string) => {
      const qs = studentId ? `?studentId=${studentId}` : '';
      return request<{ payments: ProfessorPaymentView[] }>(`/professors/payments${qs}`);
    },
    createPayment: (body: { studentId: string; amount: number; status?: 'PAID' | 'PENDING'; date?: string; notes?: string }) =>
      request<{ message: string; payment: Payment }>('/professors/payments', { method: 'POST', body: JSON.stringify(body) }),
    updatePayment: (paymentId: string, body: Partial<{ status: 'PAID' | 'PENDING'; amount: number }>) =>
      request<{ message: string; payment: Payment }>(`/professors/payments/${paymentId}`, { method: 'PUT', body: JSON.stringify(body) }),
    getHistory: () => request<ProfessorHistory>('/professors/history'),
  },
};
