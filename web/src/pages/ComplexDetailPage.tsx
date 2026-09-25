import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { ScheduleGrid, PublicTurnData } from '../components/ScheduleGrid';
import { RoleGateCard } from '../components/RoleGateCard';
import { getComplexGallery } from '../lib/stockPhotos';
import {
  MapPin,
  Clock,
  Phone,
  Calendar,
  ChevronLeft,
  GraduationCap,
  LayoutDashboard,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

export const ComplexDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const [complex, setComplex] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Turns for selected date
  const [turns, setTurns] = useState<PublicTurnData[]>([]);
  const [loadingTurns, setLoadingTurns] = useState(false);

  // Date selection state
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });

  // Professor link state
  const [isApprovedProfessor, setIsApprovedProfessor] = useState(false);
  const [professorRequestSent, setProfessorRequestSent] = useState(false);
  const [requestLoading, setRequestLoading] = useState(false);

  // Gallery state
  const [activeImage, setActiveImage] = useState(0);

  // Generate 14 selectable date pills
  const nextDays = Array.from({ length: 14 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const isToday = i === 0;
    const isTomorrow = i === 1;

    return {
      dateStr,
      dayNumber: d.getDate(),
      dayName: isToday ? 'Hoy' : isTomorrow ? 'Mañana' : dayNames[d.getDay()],
      monthName: d.toLocaleString('es-AR', { month: 'short' }),
    };
  });

  const fetchComplexDetails = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.complexes.getById(id);
      setComplex(res.complex);

      // Check professor connection if user is professor
      if (user?.role === 'PROFESOR') {
        const profRes = await api.professors.getMyComplexes();
        const approved = profRes.approvedComplexes?.some((c: any) => c.id === id);
        const pending = profRes.requests?.some((r: any) => r.complexId === id && r.status === 'PENDING');
        setIsApprovedProfessor(Boolean(approved));
        setProfessorRequestSent(Boolean(pending));
      }
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 404) {
        setError('Complejo no encontrado.');
      } else {
        setError('Error al cargar la información del complejo.');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchTurns = async () => {
    if (!id) return;
    setLoadingTurns(true);
    try {
      const res = await api.turns.getByDateRange(id, selectedDate, selectedDate);
      setTurns(res.turns || []);
    } catch (err) {
      console.error('Error fetching turns:', err);
    } finally {
      setLoadingTurns(false);
    }
  };

  useEffect(() => {
    fetchComplexDetails();
    setActiveImage(0);
  }, [id, user]);

  useEffect(() => {
    if (complex) {
      fetchTurns();
    }
  }, [selectedDate, complex]);

  const handleRequestJoinAsProfessor = async () => {
    if (!id) return;
    setRequestLoading(true);
    try {
      await api.professors.sendRequest(id);
      setProfessorRequestSent(true);
    } catch (err: any) {
      alert(err.message || 'Error al enviar solicitud.');
    } finally {
      setRequestLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="container" style={{ padding: '6rem 0', textAlign: 'center', color: 'var(--text-muted)' }}>
        Cargando complejo y disponibilidad...
      </div>
    );
  }

  if (error || !complex) {
    return (
      <RoleGateCard
        icon={<AlertCircle size={48} color="var(--status-blocked)" />}
        title="Complejo no encontrado"
        description="El complejo al que intentas acceder no existe o fue desactivado."
        cta={
          <>
            <ChevronLeft size={16} />
            <span>Volver al Catálogo</span>
          </>
        }
        ctaHref="/"
      />
    );
  }

  const isOwnerOfThis = user?.id === complex.ownerId;
  const galleryImages = complex.imageUrl
    ? [complex.imageUrl, ...getComplexGallery(complex.id, 2)]
    : getComplexGallery(complex.id, 3);

  return (
    <div className="main-content">
      {/* Top Banner / Complex Header */}
      <section style={{
        position: 'relative',
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border-subtle)',
        paddingTop: '2rem',
        paddingBottom: '2.5rem',
      }}>
        <div className="container">
          <Link
            to="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              color: 'var(--text-muted)',
              fontSize: '0.875rem',
              fontWeight: 600,
              marginBottom: '1.5rem',
            }}
          >
            <ChevronLeft size={16} />
            <span>Volver al catálogo</span>
          </Link>

          <div className="detail-header-grid">
            <div>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.3rem 0.75rem',
                background: 'rgba(58, 122, 240, 0.14)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--accent-primary)',
                fontSize: '0.8rem',
                fontWeight: 700,
                marginBottom: '0.75rem',
              }}>
                <MapPin size={13} />
                <span>{complex.location}</span>
              </div>

              <h1 style={{ fontSize: 'var(--text-4xl)', fontWeight: 800, marginBottom: '0.75rem', color: '#ffffff' }}>
                {complex.name}
              </h1>

              <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
                {complex.description || 'Complejo deportivo de pádel de primer nivel con canchas de cristal profesionales.'}
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <MapPin size={16} color="var(--accent-cyan)" />
                  <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{complex.address}</span>
                </div>
                {complex.openingHours && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <Clock size={16} color="var(--accent-primary)" />
                    <span>{complex.openingHours}</span>
                  </div>
                )}
                {complex.phone && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <Phone size={16} color="var(--accent-secondary)" />
                    <span>{complex.phone}</span>
                  </div>
                )}
              </div>

              {/* Owner and Professor Actions */}
              <div style={{ marginTop: '1.75rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {isOwnerOfThis && (
                  <Link to="/owner" className="btn btn-lime btn-sm">
                    <LayoutDashboard size={16} />
                    <span>Gestionar en Excel de Canchas</span>
                  </Link>
                )}

                {user?.role === 'PROFESOR' && (
                  isApprovedProfessor ? (
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      background: 'rgba(242, 165, 61, 0.15)',
                      color: 'var(--accent-secondary)',
                      padding: '0.4rem 0.8rem',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                    }}>
                      <CheckCircle2 size={16} />
                      <span>Profesor Vinculado (Puedes reservar clases)</span>
                    </div>
                  ) : professorRequestSent ? (
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      background: 'rgba(242, 165, 61, 0.15)',
                      color: '#ffc363',
                      padding: '0.4rem 0.8rem',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                    }}>
                      <Clock size={16} />
                      <span>Solicitud de vinculación pendiente</span>
                    </div>
                  ) : (
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={requestLoading}
                      onClick={handleRequestJoinAsProfessor}
                    >
                      <GraduationCap size={16} />
                      <span>{requestLoading ? 'Enviando...' : 'Solicitar unirme como Profesor'}</span>
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Complex Gallery */}
            <div>
              <div className="detail-gallery-main">
                <img src={galleryImages[activeImage]} alt={complex.name} />
              </div>
              {galleryImages.length > 1 && (
                <div className="detail-gallery-thumbs">
                  {galleryImages.map((src, i) => (
                    <button
                      key={src + i}
                      className={`detail-gallery-thumb ${i === activeImage ? 'active' : ''}`}
                      onClick={() => setActiveImage(i)}
                      aria-label={`Ver foto ${i + 1} de ${complex.name}`}
                    >
                      <img src={src} alt="" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Booking / Calendar Section */}
      <section className="container" style={{ paddingTop: '2.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: 'var(--text-2xl)', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Calendar size={20} color="var(--accent-primary)" />
              <span>Turnos y disponibilidad</span>
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              Elegí una fecha y hacé clic en un turno disponible para confirmar tu reserva.
            </p>
          </div>
        </div>

        {/* Date Selector Navigation Carousel / Horizontal Bar */}
        <div style={{
          display: 'flex',
          gap: '0.5rem',
          overflowX: 'auto',
          paddingBottom: '0.75rem',
          marginBottom: '2rem',
        }}>
          {nextDays.map((day) => {
            const isSelected = selectedDate === day.dateStr;

            return (
              <button
                key={day.dateStr}
                onClick={() => setSelectedDate(day.dateStr)}
                style={{
                  minWidth: '90px',
                  padding: '0.75rem 0.5rem',
                  borderRadius: 'var(--radius-md)',
                  background: isSelected
                    ? 'var(--accent-secondary)'
                    : 'var(--bg-card)',
                  color: isSelected ? 'var(--text-inverse)' : 'var(--text-main)',
                  border: `1px solid ${isSelected ? 'transparent' : 'var(--border-subtle)'}`,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.2rem',
                  cursor: 'pointer',
                  transition: 'all var(--transition-fast)',
                  boxShadow: isSelected ? 'var(--shadow-glow-lime)' : 'none',
                }}
              >
                <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', opacity: isSelected ? 0.9 : 0.6 }}>
                  {day.dayName}
                </span>
                <span style={{ fontSize: '1.35rem', fontWeight: 800, lineHeight: 1 }}>
                  {day.dayNumber}
                </span>
                <span style={{ fontSize: '0.7rem', fontWeight: 600, opacity: isSelected ? 0.9 : 0.6 }}>
                  {day.monthName}
                </span>
              </button>
            );
          })}
        </div>

        {/* Public Turn Grid */}
        {loadingTurns ? (
          <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>
            Actualizando disponibilidad...
          </div>
        ) : (
          <ScheduleGrid
            mode="PUBLIC"
            complexId={complex.id}
            complexName={complex.name}
            isApprovedProfessor={isApprovedProfessor}
            turns={turns}
            selectedDate={selectedDate}
            onRefreshTurns={fetchTurns}
          />
        )}
      </section>
    </div>
  );
};
