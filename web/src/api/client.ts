import type {
  Complex,
  ComplexSummary,
  CourtWithTemplate,
  Turn,
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
  } else if (contentType && contentType.includes('spreadsheetml')) {
    return (await response.blob()) as any;
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

interface SaveScheduleResult {
  message: string;
  success?: boolean;
  hasConflicts?: boolean;
  conflictType?: 'COURT_DELETION' | 'CELL_BLOCKED';
  conflicts?: ScheduleConflict[];
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

  // Schedules ("Excel de canchas")
  schedules: {
    get: (complexId: string) => request<{ courts: CourtWithTemplate[] }>(`/complexes/${complexId}/schedule`),
    save: (complexId: string, payload: any) =>
      request<SaveScheduleResult>(`/complexes/${complexId}/schedule`, { method: 'PUT', body: JSON.stringify(payload) }),
    exportExcel: (complexId: string) => request<Blob>(`/complexes/${complexId}/schedule/export`),
    importExcel: (complexId: string, fileBase64: string) =>
      request<{ message: string }>(`/complexes/${complexId}/schedule/import`, {
        method: 'POST',
        body: JSON.stringify({ fileBase64 }),
      }),
  },

  // Turns & Public Calendar
  turns: {
    getByDateRange: (complexId: string, fromDate: string, toDate: string) =>
      request<{ turns: Turn[] }>(`/complexes/${complexId}/turns?from=${fromDate}&to=${toDate}`),
  },

  // Reservations
  reservations: {
    create: (turnId: string, body: { guestName: string; guestPhone: string; guestEmail?: string; type?: 'PLAYER' | 'CLASS'; notes?: string }) =>
      request<CreateReservationResponse>(`/turns/${turnId}/reservations`, { method: 'POST', body: JSON.stringify(body) }),
    cancel: (id: string) => request<{ message: string }>(`/reservations/${id}`, { method: 'DELETE' }),
    getComplexReservations: (complexId: string) =>
      request<{ reservations: OwnerReservationView[]; stats: { totalReservations: number; totalCollected: number; totalPending: number } }>(
        `/complexes/${complexId}/reservations`
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
