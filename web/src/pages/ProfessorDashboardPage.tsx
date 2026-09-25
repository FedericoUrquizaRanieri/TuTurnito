import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import {
  GraduationCap,
  Users,
  DollarSign,
  Calendar,
  Plus,
  Building,
  CheckCircle,
  Clock,
  Trash2,
  Edit2,
  X,
  Sparkles,
  ShieldAlert,
  Phone,
  Mail
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { StatCard } from '../components/StatCard';
import { EmptyState } from '../components/EmptyState';
import { RoleGateCard } from '../components/RoleGateCard';
import { PaymentStatusBadge } from '../components/PaymentStatusBadge';
import type { Complex, ProfessorRequest, StudentWithBalance, ProfessorPaymentView, ProfessorHistory } from '../types';

export const ProfessorDashboardPage: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'COMPLEXES' | 'STUDENTS' | 'PAYMENTS' | 'HISTORY'>('COMPLEXES');

  // Complexes & requests
  const [approvedComplexes, setApprovedComplexes] = useState<Complex[]>([]);
  const [requests, setRequests] = useState<ProfessorRequest[]>([]);
  const [loadingComplexes, setLoadingComplexes] = useState(false);

  // Students state
  const [students, setStudents] = useState<StudentWithBalance[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [studentForm, setStudentForm] = useState({ name: '', phone: '', email: '', notes: '' });

  // Payments state
  const [payments, setPayments] = useState<ProfessorPaymentView[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    studentId: '',
    amount: 12000,
    status: 'PAID' as 'PAID' | 'PENDING',
    date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  // History & summary
  const [historyData, setHistoryData] = useState<ProfessorHistory | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    loadComplexes();
    loadStudents();
    loadPayments();
    loadHistory();
  }, [user]);

  const loadComplexes = async () => {
    setLoadingComplexes(true);
    try {
      const res = await api.professors.getMyComplexes();
      setApprovedComplexes(res.approvedComplexes || []);
      setRequests(res.requests || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingComplexes(false);
    }
  };

  const loadStudents = async () => {
    setLoadingStudents(true);
    try {
      const res = await api.professors.getStudents();
      setStudents(res.students || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingStudents(false);
    }
  };

  const loadPayments = async () => {
    setLoadingPayments(true);
    try {
      const res = await api.professors.getPayments();
      setPayments(res.payments || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingPayments(false);
    }
  };

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await api.professors.getHistory();
      setHistoryData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Student handlers
  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingStudentId) {
        await api.professors.updateStudent(editingStudentId, studentForm);
      } else {
        await api.professors.createStudent(studentForm);
      }
      setShowStudentModal(false);
      setEditingStudentId(null);
      setStudentForm({ name: '', phone: '', email: '', notes: '' });
      loadStudents();
      loadHistory();
    } catch (err: any) {
      alert(err.message || 'Error al guardar alumno');
    }
  };

  const handleDeleteStudent = async (studentId: string) => {
    if (!confirm('¿Estás seguro de eliminar este alumno? Su historial de cobros se conservará.')) return;
    try {
      await api.professors.deleteStudent(studentId);
      loadStudents();
    } catch (err: any) {
      alert(err.message || 'Error al eliminar alumno');
    }
  };

  // Payment handlers
  const handleCreatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.professors.createPayment({
        ...paymentForm,
        amount: Number(paymentForm.amount),
      });
      setShowPaymentModal(false);
      setPaymentForm({
        studentId: '',
        amount: 12000,
        status: 'PAID',
        date: new Date().toISOString().split('T')[0],
        notes: '',
      });
      loadPayments();
      loadStudents();
      loadHistory();
    } catch (err: any) {
      alert(err.message || 'Error al registrar cobro');
    }
  };

  const handleTogglePaymentStatus = async (paymentId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'PAID' ? 'PENDING' : 'PAID';
    try {
      await api.professors.updatePayment(paymentId, { status: nextStatus });
      loadPayments();
      loadStudents();
      loadHistory();
    } catch (err: any) {
      alert(err.message || 'Error al actualizar cobro');
    }
  };

  if (!user || user.role !== 'PROFESOR') {
    return (
      <RoleGateCard
        icon={<ShieldAlert size={48} color="#a3e635" />}
        title="Acceso Exclusivo para Profesores"
        description="Inicia sesión con tu cuenta de Profesor para gestionar tus clases, alumnos y cobros."
        cta="Iniciar Sesión como Profesor"
        ctaHref="/auth?mode=login"
        ctaVariant="lime"
      />
    );
  }

  return (
    <div className="main-content">
      {/* Header */}
      <section style={{
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border-subtle)',
        padding: '2rem 0',
      }}>
        <div className="container">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                <span className="badge badge-role">Panel de Profesor</span>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{user.name}</span>
              </div>
              <h1 style={{ fontSize: '1.85rem', fontWeight: 800, color: '#ffffff' }}>
                Gestión de Clases y Alumnos
              </h1>
            </div>

            <Link to="/" className="btn btn-secondary btn-sm">
              <Building size={15} />
              <span>Explorar Catálogo de Complejos</span>
            </Link>
          </div>

          {/* Navigation Tabs */}
          <div className="tabs-header" style={{ marginTop: '1.75rem', marginBottom: 0 }}>
            <button
              className={`tab-btn ${activeTab === 'COMPLEXES' ? 'active' : ''}`}
              onClick={() => setActiveTab('COMPLEXES')}
            >
              <Building size={16} />
              <span>Mis Complejos ({approvedComplexes.length})</span>
            </button>

            <button
              className={`tab-btn ${activeTab === 'STUDENTS' ? 'active' : ''}`}
              onClick={() => setActiveTab('STUDENTS')}
            >
              <Users size={16} />
              <span>Alumnos ({students.length})</span>
            </button>

            <button
              className={`tab-btn ${activeTab === 'PAYMENTS' ? 'active' : ''}`}
              onClick={() => setActiveTab('PAYMENTS')}
            >
              <DollarSign size={16} />
              <span>Cobros de Clases</span>
            </button>

            <button
              className={`tab-btn ${activeTab === 'HISTORY' ? 'active' : ''}`}
              onClick={() => setActiveTab('HISTORY')}
            >
              <Calendar size={16} />
              <span>Historial de Clases</span>
            </button>
          </div>
        </div>
      </section>

      {/* Main Tab Content */}
      <section className="container" style={{ paddingTop: '2rem' }}>
        {/* TAB 1: MIS COMPLEJOS */}
        {activeTab === 'COMPLEXES' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '1.3rem', fontWeight: 800 }}>Complejos Vinculados</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Complejos donde tienes permiso aprobado para reservar canchas y dictar clases.
                </p>
              </div>

              <Link to="/" className="btn btn-lime btn-sm">
                <Plus size={15} />
                <span>Solicitar unirme a otro complejo</span>
              </Link>
            </div>

            {loadingComplexes ? (
              <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>
                Cargando complejos...
              </div>
            ) : approvedComplexes.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '3.5rem 2rem',
                background: 'var(--bg-card)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-subtle)',
              }}>
                <Building size={48} color="var(--text-subtle)" style={{ marginBottom: '1rem' }} />
                <h4 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                  Aún no estás vinculado a ningún complejo
                </h4>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '440px', margin: '0 auto 1.5rem auto' }}>
                  Navega por el catálogo de complejos y solicita unirte al club donde deseas dictar tus clases.
                </p>
                <Link to="/" className="btn btn-primary">
                  Ver Complejos Disponibles
                </Link>
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: '1.5rem',
                marginBottom: '2.5rem',
              }}>
                {approvedComplexes.map((c) => (
                  <div key={c.id} className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                      <h4 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff' }}>{c.name}</h4>
                      <span className="badge badge-available">Aprobado</span>
                    </div>

                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                      {c.address} • {c.location}
                    </p>

                    <div style={{ marginTop: 'auto', borderTop: '1px solid var(--border-subtle)', paddingTop: '1rem' }}>
                      <Link to={`/complexes/${c.id}`} className="btn btn-lime btn-sm" style={{ width: '100%', justifyContent: 'center' }}>
                        <Sparkles size={15} />
                        <span>Reservar Cancha para Clase</span>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pending Requests */}
            {requests.length > 0 && (
              <div>
                <h4 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '1rem', color: 'var(--text-muted)' }}>
                  Solicitudes Enviadas
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {requests.map((r) => (
                    <div
                      key={r.id}
                      className="card"
                      style={{
                        padding: '1rem 1.25rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700 }}>{r.complex?.name}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          Enviada el {new Date(r.requestedAt).toLocaleDateString('es-AR')}
                        </div>
                      </div>

                      <span className={`badge ${r.status === 'APPROVED' ? 'badge-available' : r.status === 'REJECTED' ? 'badge-blocked' : 'badge-pending'}`}>
                        {r.status === 'APPROVED' ? 'APROBADA' : r.status === 'REJECTED' ? 'RECHAZADA' : 'PENDIENTE'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: ALUMNOS */}
        {activeTab === 'STUDENTS' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '1.3rem', fontWeight: 800 }}>Listado de Alumnos</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Registra los datos de tus alumnos y consulta su estado de cobros y saldos pendientes.
                </p>
              </div>

              <button
                className="btn btn-lime btn-sm"
                onClick={() => {
                  setEditingStudentId(null);
                  setStudentForm({ name: '', phone: '', email: '', notes: '' });
                  setShowStudentModal(true);
                }}
              >
                <Plus size={15} />
                <span>Agregar Alumno</span>
              </button>
            </div>

            {loadingStudents ? (
              <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>
                Cargando alumnos...
              </div>
            ) : students.length === 0 ? (
              <EmptyState message='Aún no has registrado alumnos. Haz clic en "Agregar Alumno" para comenzar.' />
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: '1.25rem',
              }}>
                {students.map((st) => (
                  <div key={st.id} className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                      <h4 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#ffffff' }}>{st.name}</h4>
                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        <button
                          onClick={() => {
                            setEditingStudentId(st.id);
                            setStudentForm({
                              name: st.name,
                              phone: st.phone,
                              email: st.email || '',
                              notes: st.notes || '',
                            });
                            setShowStudentModal(true);
                          }}
                          style={{ color: 'var(--text-muted)', padding: '0.2rem' }}
                          title="Editar alumno"
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          onClick={() => handleDeleteStudent(st.id)}
                          style={{ color: '#ef4444', padding: '0.2rem' }}
                          title="Eliminar alumno"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>

                    <div style={{ fontSize: '0.825rem', color: 'var(--text-muted)', marginBottom: '1rem', lineHeight: 1.5 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Phone size={13} /> {st.phone}</div>
                      {st.email && <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Mail size={13} /> {st.email}</div>}
                      {st.notes && <div style={{ marginTop: '0.3rem', fontStyle: 'italic' }}>"{st.notes}"</div>}
                    </div>

                    <div style={{
                      marginTop: 'auto',
                      borderTop: '1px solid var(--border-subtle)',
                      paddingTop: '0.75rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}>
                      <div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                          Saldo Pendiente
                        </div>
                        <div style={{
                          fontWeight: 800,
                          fontSize: '1.05rem',
                          color: st.totalPending > 0 ? '#fbbf24' : 'var(--accent-primary)',
                        }}>
                          {st.totalPending > 0 ? `$${st.totalPending.toLocaleString('es-AR')}` : 'Al día ($0)'}
                        </div>
                      </div>

                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setPaymentForm({
                            studentId: st.id,
                            amount: 12000,
                            status: 'PAID',
                            date: new Date().toISOString().split('T')[0],
                            notes: `Cobro a ${st.name}`,
                          });
                          setShowPaymentModal(true);
                        }}
                      >
                        <DollarSign size={14} />
                        <span>Cobrar</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: COBROS DE CLASES */}
        {activeTab === 'PAYMENTS' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '1.3rem', fontWeight: 800 }}>Historial de Cobros de Clases</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Registro manual de abonos y clases particulares cobradas a tus alumnos.
                </p>
              </div>

              <button
                className="btn btn-lime btn-sm"
                onClick={() => {
                  setPaymentForm({
                    studentId: students[0]?.id || '',
                    amount: 12000,
                    status: 'PAID',
                    date: new Date().toISOString().split('T')[0],
                    notes: '',
                  });
                  setShowPaymentModal(true);
                }}
              >
                <Plus size={15} />
                <span>Registrar Nuevo Cobro</span>
              </button>
            </div>

            {loadingPayments ? (
              <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>
                Cargando cobros...
              </div>
            ) : payments.length === 0 ? (
              <EmptyState message="No hay cobros registrados aún." />
            ) : (
              <div style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-lg)',
                overflowX: 'auto',
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '650px' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '1rem' }}>FECHA</th>
                      <th style={{ padding: '1rem' }}>ALUMNO</th>
                      <th style={{ padding: '1rem' }}>CONCEPTO / NOTAS</th>
                      <th style={{ padding: '1rem' }}>MONTO</th>
                      <th style={{ padding: '1rem', textAlign: 'right' }}>ESTADO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => {
                      return (
                        <tr key={p.id} style={{ borderBottom: '1px solid var(--border-subtle)', fontSize: '0.875rem' }}>
                          <td style={{ padding: '1rem', fontWeight: 600 }}>{p.date}</td>
                          <td style={{ padding: '1rem', fontWeight: 700, color: '#ffffff' }}>{p.studentName}</td>
                          <td style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.825rem' }}>
                            {p.notes || 'Cobro de clase'}
                          </td>
                          <td style={{ padding: '1rem', fontWeight: 800, color: 'var(--accent-secondary)' }}>
                            ${p.amount.toLocaleString('es-AR')}
                          </td>
                          <td style={{ padding: '1rem', textAlign: 'right' }}>
                            <PaymentStatusBadge status={p.status} onClick={() => handleTogglePaymentStatus(p.id, p.status)} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: HISTORIAL DE CLASES */}
        {activeTab === 'HISTORY' && (
          <div>
            {/* KPI Summary Cards */}
            {historyData?.summary && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '1.25rem',
                marginBottom: '2rem',
              }}>
                <StatCard icon={<GraduationCap size={24} />} label="Clases Dictadas" value={historyData.summary.totalClasses} />
                <StatCard
                  icon={<CheckCircle size={24} />}
                  iconBg="rgba(16, 185, 129, 0.15)"
                  iconColor="var(--accent-primary)"
                  label="Total Recaudado"
                  value={`$${historyData.summary.totalCollected.toLocaleString('es-AR')}`}
                  valueColor="var(--accent-primary)"
                />
                <StatCard
                  icon={<Clock size={24} />}
                  iconBg="rgba(245, 158, 11, 0.15)"
                  iconColor="#fbbf24"
                  label="Saldos Pendientes"
                  value={`$${historyData.summary.totalPending.toLocaleString('es-AR')}`}
                  valueColor="#fbbf24"
                />
              </div>
            )}

            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '1rem' }}>
              Próximas Clases Programadas
            </h3>

            {loadingHistory ? (
              <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>
                Cargando historial...
              </div>
            ) : historyData?.upcomingClasses?.length === 0 ? (
              <EmptyState
                message="No tienes clases futuras reservadas. Puedes reservar canchas para tus clases en los complejos aprobados."
                padding="2rem"
                textAlign="left"
                marginBottom="2rem"
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginBottom: '2.5rem' }}>
                {historyData?.upcomingClasses?.map((cls: any) => (
                  <div key={cls.id} className="card" style={{ padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#ffffff' }}>
                        {cls.complex?.name} • {cls.turn?.court?.name}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--accent-secondary)', fontWeight: 700, fontSize: '0.9rem', marginTop: '0.2rem' }}>
                        <Calendar size={14} />
                        <span>{cls.turn?.date} a las {cls.turn?.startTime} - {cls.turn?.endTime} hs</span>
                      </div>
                      {cls.notes && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{cls.notes}</div>}
                    </div>

                    <span className="badge badge-role">Clase Programada</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* MODAL AGREGAR / EDITAR ALUMNO */}
      {showStudentModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <button
              onClick={() => setShowStudentModal(false)}
              style={{ position: 'absolute', top: '1.25rem', right: '1.25rem', color: 'var(--text-muted)' }}
            >
              <X size={20} />
            </button>

            <h3 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '1.25rem' }}>
              {editingStudentId ? 'Editar Alumno' : 'Nuevo Alumno'}
            </h3>

            <form onSubmit={handleSaveStudent}>
              <div className="form-group">
                <label className="form-label">Nombre y Apellido *</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  placeholder="Ej: Camila Gómez"
                  value={studentForm.name}
                  onChange={(e) => setStudentForm({ ...studentForm, name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Teléfono / WhatsApp *</label>
                <input
                  type="tel"
                  required
                  className="form-input"
                  placeholder="Ej: 291 422-3344"
                  value={studentForm.phone}
                  onChange={(e) => setStudentForm({ ...studentForm, phone: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Email (opcional)</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="camila@gmail.com"
                  value={studentForm.email}
                  onChange={(e) => setStudentForm({ ...studentForm, email: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Notas o Nivel</label>
                <textarea
                  className="form-textarea"
                  placeholder="Nivel de juego, horarios preferidos, abono acordado..."
                  value={studentForm.notes}
                  onChange={(e) => setStudentForm({ ...studentForm, notes: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowStudentModal(false)}
                  style={{ flex: 1 }}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-lime" style={{ flex: 2 }}>
                  <span>{editingStudentId ? 'Guardar Cambios' : 'Registrar Alumno'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL REGISTRAR COBRO */}
      {showPaymentModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <button
              onClick={() => setShowPaymentModal(false)}
              style={{ position: 'absolute', top: '1.25rem', right: '1.25rem', color: 'var(--text-muted)' }}
            >
              <X size={20} />
            </button>

            <h3 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '1.25rem' }}>
              Registrar Cobro de Clase
            </h3>

            <form onSubmit={handleCreatePayment}>
              <div className="form-group">
                <label className="form-label">Seleccionar Alumno *</label>
                <select
                  className="form-select"
                  required
                  value={paymentForm.studentId}
                  onChange={(e) => setPaymentForm({ ...paymentForm, studentId: e.target.value })}
                >
                  <option value="">-- Seleccionar --</option>
                  {students.map((st) => (
                    <option key={st.id} value={st.id}>{st.name} ({st.phone})</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Monto ($) *</label>
                  <input
                    type="number"
                    required
                    className="form-input"
                    value={paymentForm.amount}
                    onChange={(e) => setPaymentForm({ ...paymentForm, amount: Number(e.target.value) })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Fecha *</label>
                  <input
                    type="date"
                    required
                    className="form-input"
                    value={paymentForm.date}
                    onChange={(e) => setPaymentForm({ ...paymentForm, date: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Estado del Pago</label>
                <select
                  className="form-select"
                  value={paymentForm.status}
                  onChange={(e) => setPaymentForm({ ...paymentForm, status: e.target.value as any })}
                >
                  <option value="PAID">PAGADO (Efectivo/Transferencia)</option>
                  <option value="PENDING">PENDIENTE (Debe la clase)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Concepto o Notas</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ej: Abono mensual 4 clases / Clase particular"
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowPaymentModal(false)}
                  style={{ flex: 1 }}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-lime" style={{ flex: 2 }}>
                  <span>Guardar Cobro</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
