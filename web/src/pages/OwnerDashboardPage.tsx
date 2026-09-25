import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { ScheduleGrid, CourtData } from '../components/ScheduleGrid';
import { StatCard } from '../components/StatCard';
import { EmptyState } from '../components/EmptyState';
import { RoleGateCard } from '../components/RoleGateCard';
import { PaymentStatusBadge } from '../components/PaymentStatusBadge';
import {
  LayoutDashboard,
  DollarSign,
  Users,
  Building,
  CheckCircle,
  Clock,
  Trash2,
  Plus,
  Save,
  GraduationCap,
  ShieldCheck,
  Check,
  X as XIcon,
  CheckCircle2,
  User as UserIcon
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ComplexSummary, Complex, OwnerReservationView, ProfessorRequest } from '../types';

export const OwnerDashboardPage: React.FC = () => {
  const { user, refreshUser } = useAuth();

  const [activeTab, setActiveTab] = useState<'SCHEDULE' | 'PAYMENTS' | 'PROFESSORS' | 'SETTINGS'>('SCHEDULE');
  const [selectedComplexId, setSelectedComplexId] = useState<string>('');

  // Complexes owned
  const [complexes, setComplexes] = useState<ComplexSummary[]>([]);
  const [currentComplex, setCurrentComplex] = useState<Complex | null>(null);

  // New complex state
  const [newComplexData, setNewComplexData] = useState({
    name: '',
    location: 'Bahía Blanca',
    address: '',
    description: '',
    phone: '',
    openingHours: 'Lunes a Domingo 08:00 - 23:30',
    imageUrl: '',
  });

  // Schedule state
  const [courts, setCourts] = useState<CourtData[]>([]);
  const [loadingSchedule, setLoadingSchedule] = useState(false);

  // Payments / Reservations state
  const [reservations, setReservations] = useState<OwnerReservationView[]>([]);
  const [paymentStats, setPaymentStats] = useState({ totalReservations: 0, totalCollected: 0, totalPending: 0 });
  const [paymentFilter, setPaymentFilter] = useState<'ALL' | 'PAID' | 'PENDING'>('ALL');

  // Professor requests state
  const [profRequests, setProfRequests] = useState<ProfessorRequest[]>([]);
  const [loadingProfRequests, setLoadingProfRequests] = useState(false);

  // Settings update state
  const [settingsForm, setSettingsForm] = useState({
    name: '',
    location: '',
    address: '',
    description: '',
    phone: '',
    openingHours: '',
    imageUrl: '',
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState(false);

  // Fetch initial complexes
  const fetchOwnerComplexes = async () => {
    try {
      const res = await api.complexes.list();
      const owned = (res.complexes || []).filter((c: any) => c.owner?.id === user?.id);
      setComplexes(owned);

      if (owned.length > 0 && !selectedComplexId) {
        setSelectedComplexId(owned[0].id);
      }
    } catch (err) {
      console.error('Error fetching complexes:', err);
    }
  };

  useEffect(() => {
    fetchOwnerComplexes();
  }, [user]);

  // Load selected complex data
  useEffect(() => {
    if (!selectedComplexId) return;

    const fetchComplexDetail = async () => {
      try {
        const res = await api.complexes.getById(selectedComplexId);
        setCurrentComplex(res.complex);
        setSettingsForm({
          name: res.complex.name || '',
          location: res.complex.location || '',
          address: res.complex.address || '',
          description: res.complex.description || '',
          phone: res.complex.phone || '',
          openingHours: res.complex.openingHours || '',
          imageUrl: res.complex.imageUrl || '',
        });
      } catch (err) {
        console.error(err);
      }
    };

    fetchComplexDetail();
    loadScheduleData();
    loadReservationsData();
    loadProfessorRequests();
  }, [selectedComplexId]);

  const loadScheduleData = async () => {
    if (!selectedComplexId) return;
    setLoadingSchedule(true);
    try {
      const res = await api.schedules.get(selectedComplexId);
      setCourts(res.courts || []);
    } catch (err) {
      console.error('Error loading schedule:', err);
    } finally {
      setLoadingSchedule(false);
    }
  };

  const loadReservationsData = async () => {
    if (!selectedComplexId) return;
    try {
      const res = await api.reservations.getComplexReservations(selectedComplexId);
      setReservations(res.reservations || []);
      setPaymentStats(res.stats || { totalReservations: 0, totalCollected: 0, totalPending: 0 });
    } catch (err) {
      console.error('Error loading reservations:', err);
    }
  };

  const loadProfessorRequests = async () => {
    if (!selectedComplexId) return;
    setLoadingProfRequests(true);
    try {
      const res = await api.professors.getComplexRequests(selectedComplexId);
      setProfRequests(res.requests || []);
    } catch (err) {
      console.error('Error loading professor requests:', err);
    } finally {
      setLoadingProfRequests(false);
    }
  };

  const handleCreateComplex = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.complexes.create(newComplexData);
      await refreshUser();
      await fetchOwnerComplexes();
      setSelectedComplexId(res.complex.id);
    } catch (err: any) {
      alert(err.message || 'Error al crear complejo');
    }
  };

  const handleTogglePayment = async (reservationId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'PAID' ? 'PENDING' : 'PAID';
    try {
      await api.reservations.updatePayment(reservationId, { status: nextStatus });
      loadReservationsData();
    } catch (err: any) {
      alert(err.message || 'Error al actualizar pago');
    }
  };

  const handleCancelReservation = async (reservationId: string) => {
    if (!confirm('¿Estás seguro de cancelar esta reserva y liberar el turno?')) return;
    try {
      await api.reservations.cancel(reservationId);
      loadReservationsData();
      loadScheduleData();
    } catch (err: any) {
      alert(err.message || 'Error al cancelar reserva');
    }
  };

  const handleResolveProfRequest = async (requestId: string, status: 'APPROVED' | 'REJECTED') => {
    try {
      await api.professors.resolveRequest(selectedComplexId, requestId, status);
      loadProfessorRequests();
    } catch (err: any) {
      alert(err.message || 'Error al resolver solicitud');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsSuccess(false);
    try {
      await api.complexes.update(selectedComplexId, settingsForm);
      setSettingsSuccess(true);
      setTimeout(() => setSettingsSuccess(false), 3000);
      fetchOwnerComplexes();
    } catch (err: any) {
      alert(err.message || 'Error al guardar datos');
    } finally {
      setSavingSettings(false);
    }
  };

  if (!user || user.role !== 'DUEÑO') {
    return (
      <RoleGateCard
        icon={<ShieldCheck size={48} color="#38bdf8" />}
        title="Acceso Exclusivo para Dueños"
        description="Inicia sesión con una cuenta de Dueño de Complejo para administrar el Excel de Canchas y los cobros."
        cta="Iniciar Sesión como Dueño"
        ctaHref="/auth?mode=login"
      />
    );
  }

  // If owner has 0 complexes yet
  if (complexes.length === 0) {
    return (
      <div className="main-content container" style={{ paddingTop: '3rem', maxWidth: '640px' }}>
        <div className="card" style={{ padding: '2.5rem 2rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              background: 'rgba(16, 185, 129, 0.15)',
              color: 'var(--accent-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1rem auto',
            }}>
              <Building size={30} />
            </div>
            <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#ffffff' }}>
              Registra tu Complejo de Pádel
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
              Completa los datos de tu club para crear tu primer "Excel de Canchas" y comenzar a recibir reservas.
            </p>
          </div>

          <form onSubmit={handleCreateComplex}>
            <div className="form-group">
              <label className="form-label">Nombre del Complejo *</label>
              <input
                type="text"
                required
                className="form-input"
                placeholder="Ej: Pádel Master Club"
                value={newComplexData.name}
                onChange={(e) => setNewComplexData({ ...newComplexData, name: e.target.value })}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Ciudad / Zona *</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  placeholder="Ej: Bahía Blanca"
                  value={newComplexData.location}
                  onChange={(e) => setNewComplexData({ ...newComplexData, location: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Dirección *</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  placeholder="Ej: Av. Alem 1234"
                  value={newComplexData.address}
                  onChange={(e) => setNewComplexData({ ...newComplexData, address: e.target.value })}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Teléfono / WhatsApp</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="291 4567890"
                  value={newComplexData.phone}
                  onChange={(e) => setNewComplexData({ ...newComplexData, phone: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Horario de Atención</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Lun a Dom 08:00 - 23:30"
                  value={newComplexData.openingHours}
                  onChange={(e) => setNewComplexData({ ...newComplexData, openingHours: e.target.value })}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Descripción</label>
              <textarea
                className="form-textarea"
                placeholder="Instalaciones, canchas de cristal, iluminación, servicios..."
                value={newComplexData.description}
                onChange={(e) => setNewComplexData({ ...newComplexData, description: e.target.value })}
              />
            </div>

            <button type="submit" className="btn btn-lime btn-lg" style={{ width: '100%', marginTop: '0.5rem' }}>
              <Plus size={18} />
              <span>Crear Complejo y Abrir Excel de Canchas</span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  const filteredReservations = reservations.filter((r) => {
    if (paymentFilter === 'PAID') return r.paymentStatus === 'PAID';
    if (paymentFilter === 'PENDING') return r.paymentStatus === 'PENDING';
    return true;
  });

  return (
    <div className="main-content">
      {/* Dashboard Top Header */}
      <section style={{
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border-subtle)',
        padding: '2rem 0',
      }}>
        <div className="container">
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                <span className="badge badge-role">Panel de Administración</span>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Dueño: {user.name}</span>
              </div>
              <h1 style={{ fontSize: '1.85rem', fontWeight: 800, color: '#ffffff' }}>
                {currentComplex?.name || 'Mi Complejo'}
              </h1>
            </div>

            {/* Complex Selector & Public Link */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              {complexes.length > 1 && (
                <select
                  className="form-select"
                  style={{ width: 'auto', fontSize: '0.85rem' }}
                  value={selectedComplexId}
                  onChange={(e) => setSelectedComplexId(e.target.value)}
                >
                  {complexes.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}

              <Link to={`/complexes/${selectedComplexId}`} className="btn btn-secondary btn-sm" target="_blank">
                <span>Ver Página Pública</span>
              </Link>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="tabs-header" style={{ marginTop: '1.75rem', marginBottom: 0 }}>
            <button
              className={`tab-btn ${activeTab === 'SCHEDULE' ? 'active' : ''}`}
              onClick={() => setActiveTab('SCHEDULE')}
            >
              <LayoutDashboard size={16} />
              <span>Excel de Canchas</span>
            </button>

            <button
              className={`tab-btn ${activeTab === 'PAYMENTS' ? 'active' : ''}`}
              onClick={() => setActiveTab('PAYMENTS')}
            >
              <DollarSign size={16} />
              <span>Cobros y Reservas ({reservations.length})</span>
            </button>

            <button
              className={`tab-btn ${activeTab === 'PROFESSORS' ? 'active' : ''}`}
              onClick={() => setActiveTab('PROFESSORS')}
            >
              <GraduationCap size={16} />
              <span>Profesores ({profRequests.filter((r) => r.status === 'PENDING').length} nuevos)</span>
            </button>

            <button
              className={`tab-btn ${activeTab === 'SETTINGS' ? 'active' : ''}`}
              onClick={() => setActiveTab('SETTINGS')}
            >
              <Building size={16} />
              <span>Datos del Complejo</span>
            </button>
          </div>
        </div>
      </section>

      {/* Main Tab Content */}
      <section className="container" style={{ paddingTop: '2rem' }}>
        {/* TAB 1: EXCEL DE CANCHAS */}
        {activeTab === 'SCHEDULE' && (
          <div>
            {loadingSchedule ? (
              <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>
                Cargando grilla semanal...
              </div>
            ) : (
              <ScheduleGrid
                mode="EDIT"
                complexId={selectedComplexId}
                initialCourts={courts}
                onSaved={() => {
                  loadScheduleData();
                  loadReservationsData();
                }}
              />
            )}
          </div>
        )}

        {/* TAB 2: GESTIÓN DE COBROS Y RESERVAS */}
        {activeTab === 'PAYMENTS' && (
          <div>
            {/* Financial Summary KPI Cards */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '1.25rem',
              marginBottom: '2rem',
            }}>
              <StatCard
                icon={<CheckCircle size={24} />}
                iconBg="rgba(16, 185, 129, 0.15)"
                iconColor="var(--accent-primary)"
                label="Total Recaudado"
                value={`$${paymentStats.totalCollected.toLocaleString('es-AR')}`}
                valueColor="var(--accent-primary)"
              />
              <StatCard
                icon={<Clock size={24} />}
                iconBg="rgba(245, 158, 11, 0.15)"
                iconColor="#fbbf24"
                label="Pendiente de Cobro"
                value={`$${paymentStats.totalPending.toLocaleString('es-AR')}`}
                valueColor="#fbbf24"
              />
              <StatCard
                icon={<Users size={24} />}
                iconBg="rgba(6, 182, 212, 0.15)"
                iconColor="var(--accent-cyan)"
                label="Total de Reservas"
                value={paymentStats.totalReservations}
              />
            </div>

            {/* Filter Buttons */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '1.25rem',
              flexWrap: 'wrap',
              gap: '1rem',
            }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Listado de Reservas del Complejo</h3>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className={`btn btn-sm ${paymentFilter === 'ALL' ? 'btn-lime' : 'btn-secondary'}`}
                  onClick={() => setPaymentFilter('ALL')}
                >
                  Todas ({reservations.length})
                </button>
                <button
                  className={`btn btn-sm ${paymentFilter === 'PENDING' ? 'btn-lime' : 'btn-secondary'}`}
                  onClick={() => setPaymentFilter('PENDING')}
                >
                  Pendientes ({reservations.filter((r) => r.paymentStatus === 'PENDING').length})
                </button>
                <button
                  className={`btn btn-sm ${paymentFilter === 'PAID' ? 'btn-lime' : 'btn-secondary'}`}
                  onClick={() => setPaymentFilter('PAID')}
                >
                  Pagadas ({reservations.filter((r) => r.paymentStatus === 'PAID').length})
                </button>
              </div>
            </div>

            {/* Reservations Table */}
            {filteredReservations.length === 0 ? (
              <EmptyState message="No hay reservas para mostrar con el filtro seleccionado." />
            ) : (
              <div style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-lg)',
                overflowX: 'auto',
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '750px' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '1rem' }}>FECHA Y HORA</th>
                      <th style={{ padding: '1rem' }}>CANCHA</th>
                      <th style={{ padding: '1rem' }}>JUGADOR / CONTACTO</th>
                      <th style={{ padding: '1rem' }}>TIPO</th>
                      <th style={{ padding: '1rem' }}>MONTO</th>
                      <th style={{ padding: '1rem' }}>ESTADO COBRO</th>
                      <th style={{ padding: '1rem', textAlign: 'right' }}>ACCIONES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReservations.map((res) => {
                      return (
                        <tr key={res.id} style={{ borderBottom: '1px solid var(--border-subtle)', fontSize: '0.875rem' }}>
                          <td style={{ padding: '1rem' }}>
                            <div style={{ fontWeight: 700, color: '#ffffff' }}>{res.date}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{res.time} hs</div>
                          </td>
                          <td style={{ padding: '1rem', fontWeight: 600 }}>{res.courtName}</td>
                          <td style={{ padding: '1rem' }}>
                            <div style={{ fontWeight: 600 }}>{res.guestName}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{res.guestPhone}</div>
                          </td>
                          <td style={{ padding: '1rem' }}>
                            <span className="badge badge-role" style={{ fontSize: '0.7rem', gap: '0.3rem' }}>
                              {res.type === 'CLASS' ? (<><GraduationCap size={11} /> Clase</>) : (<><UserIcon size={11} /> Jugador</>)}
                            </span>
                          </td>
                          <td style={{ padding: '1rem', fontWeight: 700, color: 'var(--accent-secondary)' }}>
                            ${res.paymentAmount.toLocaleString('es-AR')}
                          </td>
                          <td style={{ padding: '1rem' }}>
                            <PaymentStatusBadge
                              status={res.paymentStatus}
                              onClick={() => handleTogglePayment(res.id, res.paymentStatus)}
                              paidIcon={<Check size={12} />}
                            />
                          </td>
                          <td style={{ padding: '1rem', textAlign: 'right' }}>
                            <button
                              onClick={() => handleCancelReservation(res.id)}
                              className="btn btn-danger btn-sm"
                              style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                              title="Cancelar reserva y liberar turno"
                            >
                              <Trash2 size={13} />
                              <span>Cancelar</span>
                            </button>
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

        {/* TAB 3: PROFESORES Y SOLICITUDES */}
        {activeTab === 'PROFESSORS' && (
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.5rem' }}>
              Solicitudes de Profesores
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
              Aprueba o rechaza a los profesores que solicitan vincularse a tu club para dictar clases y reservar canchas.
            </p>

            {loadingProfRequests ? (
              <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>
                Cargando solicitudes...
              </div>
            ) : profRequests.length === 0 ? (
              <EmptyState message="No hay solicitudes de profesores registradas para este complejo." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {profRequests.map((req) => (
                  <div
                    key={req.id}
                    className="card"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '1rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '12px',
                        background: 'rgba(163, 230, 53, 0.15)',
                        color: 'var(--accent-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        <GraduationCap size={22} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#ffffff' }}>
                          {req.professor?.name}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {req.professor?.email} • {req.professor?.phone || 'Sin teléfono'}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      {req.status === 'PENDING' ? (
                        <>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => handleResolveProfRequest(req.id, 'APPROVED')}
                          >
                            <Check size={14} />
                            <span>Aprobar Profesor</span>
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleResolveProfRequest(req.id, 'REJECTED')}
                          >
                            <XIcon size={14} />
                            <span>Rechazar</span>
                          </button>
                        </>
                      ) : (
                        <span className={`badge ${req.status === 'APPROVED' ? 'badge-available' : 'badge-blocked'}`}>
                          {req.status === 'APPROVED' ? 'APROBADO' : 'RECHAZADO'}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: DATOS DEL COMPLEJO */}
        {activeTab === 'SETTINGS' && (
          <div style={{ maxWidth: '680px' }}>
            <div className="card">
              <h3 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '1.5rem', color: '#ffffff' }}>
                Editar Información del Complejo
              </h3>

              {settingsSuccess && (
                <div style={{
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.75rem 1rem',
                  color: '#34d399',
                  fontSize: '0.875rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginBottom: '1.5rem',
                }}>
                  <CheckCircle2 size={18} />
                  <span>Información actualizada correctamente.</span>
                </div>
              )}

              <form onSubmit={handleSaveSettings}>
                <div className="form-group">
                  <label className="form-label">Nombre del Complejo *</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    value={settingsForm.name}
                    onChange={(e) => setSettingsForm({ ...settingsForm, name: e.target.value })}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">Ciudad / Localidad *</label>
                    <input
                      type="text"
                      required
                      className="form-input"
                      value={settingsForm.location}
                      onChange={(e) => setSettingsForm({ ...settingsForm, location: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Dirección *</label>
                    <input
                      type="text"
                      required
                      className="form-input"
                      value={settingsForm.address}
                      onChange={(e) => setSettingsForm({ ...settingsForm, address: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">Teléfono / WhatsApp</label>
                    <input
                      type="text"
                      className="form-input"
                      value={settingsForm.phone}
                      onChange={(e) => setSettingsForm({ ...settingsForm, phone: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Horario de Atención</label>
                    <input
                      type="text"
                      className="form-input"
                      value={settingsForm.openingHours}
                      onChange={(e) => setSettingsForm({ ...settingsForm, openingHours: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">URL de Imagen / Foto de Portada</label>
                  <input
                    type="url"
                    className="form-input"
                    placeholder="https://images.unsplash.com/..."
                    value={settingsForm.imageUrl}
                    onChange={(e) => setSettingsForm({ ...settingsForm, imageUrl: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Descripción</label>
                  <textarea
                    className="form-textarea"
                    value={settingsForm.description}
                    onChange={(e) => setSettingsForm({ ...settingsForm, description: e.target.value })}
                  />
                </div>

                <button
                  type="submit"
                  disabled={savingSettings}
                  className="btn btn-lime"
                  style={{ width: '100%', marginTop: '0.5rem' }}
                >
                  <Save size={16} />
                  <span>{savingSettings ? 'Guardando...' : 'Guardar Datos'}</span>
                </button>
              </form>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
