import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../api/client';
import { OwnerReservationGrid } from '../components/owner/OwnerReservationGrid';
import { FixedBookingsPanel } from '../components/owner/FixedBookingsPanel';
import { ClosuresPanel } from '../components/owner/ClosuresPanel';
import { PriceRulesPanel } from '../components/owner/PriceRulesPanel';
import { CourtsConfigPanel } from '../components/owner/CourtsConfigPanel';
import { StatCard } from '../components/StatCard';
import { EmptyState } from '../components/EmptyState';
import { RoleGateCard } from '../components/RoleGateCard';
import {
  LayoutDashboard,
  Users,
  Building,
  CheckCircle,
  Clock,
  Plus,
  Save,
  GraduationCap,
  ShieldCheck,
  Check,
  X as XIcon,
  CheckCircle2,
  BarChart3,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ComplexSummary, Complex, Court, FixedBooking, ProfessorRequest } from '../types';
import type { ReservationStats } from '../api/client';
import { todayStr, weekRange, shortDateLabel } from '../lib/dates';


// Charts library only loads when the tab is opened.
const OwnerAnalyticsPanel = lazy(() => import('../components/owner/OwnerAnalyticsPanel').then((m) => ({ default: m.OwnerAnalyticsPanel })));
export const OwnerDashboardPage: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<'RESERVATIONS' | 'ANALYTICS' | 'PROFESSORS' | 'SETTINGS'>('RESERVATIONS');
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

  // Panel de Reservas state: courts + fixed bookings (config sub-panels),
  // this week's payment totals, and a key that forces the grid to reload
  // when something outside it (courts, fixed bookings) changes.
  const [courts, setCourts] = useState<Court[]>([]);
  const [fixedBookings, setFixedBookings] = useState<FixedBooking[]>([]);
  const [weekStats, setWeekStats] = useState<ReservationStats>({ totalReservations: 0, totalCollected: 0, totalPending: 0 });
  const [gridRefreshKey, setGridRefreshKey] = useState(0);
  const week = weekRange(todayStr());

  // Professor requests state
  const [profRequests, setProfRequests] = useState<ProfessorRequest[]>([]);
  const [loadingProfRequests, setLoadingProfRequests] = useState(false);

  // Settings update state
  const [settingsForm, setSettingsForm] = useState({
    name: '',
    slug: '',
    location: '',
    address: '',
    description: '',
    phone: '',
    openingHours: '',
    imageUrl: '',
    cancellationHours: 0,
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
      toast.error(err, 'No se pudieron cargar tus complejos.');
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
          slug: res.complex.slug || '',
          location: res.complex.location || '',
          address: res.complex.address || '',
          description: res.complex.description || '',
          phone: res.complex.phone || '',
          openingHours: res.complex.openingHours || '',
          imageUrl: res.complex.imageUrl || '',
          cancellationHours: res.complex.cancellationHours ?? 0,
        });
      } catch (err) {
        toast.error(err, 'No se pudieron cargar los datos del complejo.');
      }
    };

    fetchComplexDetail();
    loadScheduleData();
    loadWeekStats();
    loadProfessorRequests();
  }, [selectedComplexId]);

  const loadScheduleData = async () => {
    if (!selectedComplexId) return;
    try {
      const res = await api.schedules.get(selectedComplexId);
      setCourts(res.courts || []);
      setFixedBookings(res.fixedBookings || []);
    } catch (err) {
      toast.error(err, 'No se pudieron cargar las canchas.');
    }
  };

  const loadWeekStats = useCallback(async () => {
    if (!selectedComplexId) return;
    try {
      const res = await api.reservations.getComplexReservations(selectedComplexId, { from: week.from, to: week.to });
      setWeekStats(res.stats || { totalReservations: 0, totalCollected: 0, totalPending: 0 });
    } catch (err) {
      toast.error(err, 'No se pudieron cargar los cobros de la semana.');
    }
  }, [selectedComplexId, week.from, week.to, toast]);

  // Courts or fixed bookings changed: reload them, the grid and the totals.
  const handleConfigChanged = () => {
    loadScheduleData();
    loadWeekStats();
    setGridRefreshKey((k) => k + 1);
  };

  const loadProfessorRequests = async () => {
    if (!selectedComplexId) return;
    setLoadingProfRequests(true);
    try {
      const res = await api.professors.getComplexRequests(selectedComplexId);
      setProfRequests(res.requests || []);
    } catch (err) {
      toast.error(err, 'No se pudieron cargar las solicitudes de profesores.');
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
      toast.success(`Complejo "${res.complex.name}" creado.`);
    } catch (err) {
      toast.error(err, 'No se pudo crear el complejo.');
    }
  };

  const handleResolveProfRequest = async (requestId: string, status: 'APPROVED' | 'REJECTED') => {
    try {
      await api.professors.resolveRequest(selectedComplexId, requestId, status);
      loadProfessorRequests();
      toast.success(status === 'APPROVED' ? 'Profesor aprobado.' : 'Solicitud rechazada.');
    } catch (err) {
      toast.error(err, 'No se pudo resolver la solicitud.');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsSuccess(false);
    try {
      const res = await api.complexes.update(selectedComplexId, settingsForm);
      setCurrentComplex((prev) => (prev ? { ...prev, ...res.complex } : prev));
      setSettingsSuccess(true);
      setTimeout(() => setSettingsSuccess(false), 3000);
      fetchOwnerComplexes();
    } catch (err) {
      toast.error(err, 'No se pudieron guardar los datos del complejo.');
    } finally {
      setSavingSettings(false);
    }
  };

  if (!user || user.role !== 'DUEÑO') {
    return (
      <RoleGateCard
        icon={<ShieldCheck size={48} color="#38bdf8" />}
        title="Acceso Exclusivo para Dueños"
        description="Inicia sesión con una cuenta de Dueño de Complejo para administrar el Panel de Reservas y los cobros."
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
              Completa los datos de tu club para abrir tu Panel de Reservas y comenzar a recibir reservas.
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
              <span>Crear Complejo y Abrir Panel de Reservas</span>
            </button>
          </form>
        </div>
      </div>
    );
  }

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

              <Link to={`/${currentComplex?.slug || ''}`} className="btn btn-secondary btn-sm" target="_blank">
                <span>Ver Página Pública</span>
              </Link>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="tabs-header" style={{ marginTop: '1.75rem', marginBottom: 0 }}>
            <button
              className={`tab-btn ${activeTab === 'RESERVATIONS' ? 'active' : ''}`}
              onClick={() => setActiveTab('RESERVATIONS')}
            >
              <LayoutDashboard size={16} />
              <span>Panel de Reservas</span>
            </button>

            <button
              className={`tab-btn ${activeTab === 'ANALYTICS' ? 'active' : ''}`}
              onClick={() => setActiveTab('ANALYTICS')}
            >
              <BarChart3 size={16} />
              <span>Analíticas</span>
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
        {/* TAB 1: PANEL DE RESERVAS (grilla + cobros de la semana + turnos fijos + canchas) */}
        {activeTab === 'RESERVATIONS' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2.25rem' }}>
            <OwnerReservationGrid
              key={selectedComplexId}
              complexId={selectedComplexId}
              refreshKey={gridRefreshKey}
              onChanged={loadWeekStats}
            />

            {/* Cobros de esta semana */}
            <div>
              <div style={{ marginBottom: '1rem' }}>
                <h3 className="panel-section-title">Cobros de esta semana</h3>
                <p className="panel-section-sub">
                  {shortDateLabel(week.from)} al {shortDateLabel(week.to)} · el cobro de cada reserva se marca desde la grilla.
                </p>
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '1.25rem',
              }}>
                <StatCard
                  icon={<CheckCircle size={24} />}
                  iconBg="rgba(16, 185, 129, 0.15)"
                  iconColor="var(--accent-primary)"
                  label="Recaudado esta semana"
                  value={`$${weekStats.totalCollected.toLocaleString('es-AR')}`}
                  valueColor="var(--accent-primary)"
                />
                <StatCard
                  icon={<Clock size={24} />}
                  iconBg="rgba(245, 158, 11, 0.15)"
                  iconColor="#fbbf24"
                  label="Pendiente esta semana"
                  value={`$${weekStats.totalPending.toLocaleString('es-AR')}`}
                  valueColor="#fbbf24"
                />
                <StatCard
                  icon={<Users size={24} />}
                  iconBg="rgba(6, 182, 212, 0.15)"
                  iconColor="var(--accent-cyan)"
                  label="Reservas esta semana"
                  value={weekStats.totalReservations}
                />
              </div>
            </div>

            <FixedBookingsPanel
              complexId={selectedComplexId}
              courts={courts}
              fixedBookings={fixedBookings}
              onChanged={handleConfigChanged}
            />

            <ClosuresPanel
              key={`closures-${selectedComplexId}`}
              complexId={selectedComplexId}
              onChanged={handleConfigChanged}
            />

            <CourtsConfigPanel
              complexId={selectedComplexId}
              courts={courts}
              onSaved={handleConfigChanged}
            />

            <PriceRulesPanel
              key={`prices-${selectedComplexId}`}
              complexId={selectedComplexId}
              courts={courts}
              onSaved={handleConfigChanged}
            />
          </div>
        )}

        {activeTab === 'ANALYTICS' && (
          <Suspense fallback={<div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>Cargando analíticas...</div>}>
            <OwnerAnalyticsPanel key={selectedComplexId} complexId={selectedComplexId} />
          </Suspense>
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

                <div className="form-group">
                  <label className="form-label" htmlFor="complex-slug">Dirección pública (link para compartir)</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {window.location.host}/
                    </span>
                    <input
                      id="complex-slug"
                      type="text"
                      required
                      minLength={3}
                      maxLength={60}
                      pattern="[a-z0-9]+(-[a-z0-9]+)*"
                      title="Solo minúsculas, números y guiones"
                      className="form-input"
                      value={settingsForm.slug}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          // Typing-friendly: spaces become dashes, the rest is left for validation.
                          slug: e.target.value.toLowerCase().replace(/\s+/g, '-'),
                        })
                      }
                    />
                  </div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', marginTop: '0.35rem' }}>
                    Solo minúsculas, números y guiones. Si la cambiás, los links que ya compartiste dejan de funcionar.
                  </p>
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
                  <label className="form-label">Cancelación desde la app</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Los jugadores pueden cancelar hasta</span>
                    <input
                      type="number"
                      className="form-input"
                      min={0}
                      max={72}
                      step={1}
                      style={{ width: '90px' }}
                      value={settingsForm.cancellationHours}
                      onChange={(e) => setSettingsForm({ ...settingsForm, cancellationHours: Math.max(0, Math.min(72, Math.round(Number(e.target.value) || 0))) })}
                    />
                    <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>horas antes del turno.</span>
                  </div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', marginTop: '0.35rem' }}>
                    Con 0 pueden cancelar hasta que empiece. Pasado el plazo tienen que escribirte; vos podés cancelar siempre desde la grilla.
                  </p>
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
