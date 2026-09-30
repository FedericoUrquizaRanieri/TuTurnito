import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../api/client';
import { Link } from 'react-router-dom';
import { Calendar, Clock, MapPin, DollarSign, Trash2, Trophy, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';
import { RoleGateCard } from '../components/RoleGateCard';
import { PaymentStatusBadge } from '../components/PaymentStatusBadge';
import { WhatsappButton } from '../components/WhatsappButton';
import { shortDateLabel } from '../lib/dates';
import type { MyReservation } from '../types';
import { MyOpenMatchPanel } from '../components/openMatch/MyOpenMatchPanel';

const PAGE_SIZE = 4;

const Pagination: React.FC<{ page: number; totalPages: number; onChange: (page: number) => void }> = ({ page, totalPages, onChange }) => {
  if (totalPages <= 1) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginTop: '1rem' }}>
      <button
        className="btn btn-secondary btn-sm"
        onClick={() => onChange(page - 1)}
        disabled={page === 0}
        style={{ opacity: page === 0 ? 0.5 : 1 }}
      >
        <ChevronLeft size={16} />
        <span>Anterior</span>
      </button>
      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
        Página {page + 1} de {totalPages}
      </span>
      <button
        className="btn btn-secondary btn-sm"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages - 1}
        style={{ opacity: page >= totalPages - 1 ? 0.5 : 1 }}
      >
        <span>Siguiente</span>
        <ChevronRight size={16} />
      </button>
    </div>
  );
};

export const MyReservationsPage: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();
  const [reservations, setReservations] = useState<MyReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [upcomingPage, setUpcomingPage] = useState(0);
  const [pastPage, setPastPage] = useState(0);

  const fetchMyReservations = async () => {
    setLoading(true);
    try {
      const res = await api.reservations.getMyReservations();
      setReservations(res.reservations || []);
    } catch (err) {
      toast.error(err, 'No se pudieron cargar tus reservas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchMyReservations();
    }
  }, [user]);

  const handleCancelReservation = async (id: string) => {
    const r = reservations.find((x) => x.id === id);
    const players = r?.openMatch?.players.length ?? 0;
    const warning = players > 0 ? `

Los ${players} jugador${players === 1 ? '' : 'es'} que se sumaron reciben un aviso por email.` : '';
    if (!confirm(`¿Estás seguro de cancelar tu reserva? El turno quedará disponible nuevamente para otros jugadores.${warning}`)) return;
    try {
      await api.reservations.cancel(id);
      toast.success('Reserva cancelada. El turno quedó libre.');
      setUpcomingPage(0);
      fetchMyReservations();
    } catch (err) {
      toast.error(err, 'Error al cancelar la reserva.');
    }
  };

  if (!user) {
    return (
      <RoleGateCard
        icon={<Calendar size={48} color="var(--accent-secondary)" />}
        title="Mis Reservas"
        description="Inicia sesión para consultar tus turnos reservados, estados de cobro y opciones de cancelación."
        cta="Iniciar Sesión"
        ctaHref="/auth?mode=login"
      />
    );
  }

  const upcomingReservations = reservations.filter((r) => !r.isPast);
  const pastReservations = reservations.filter((r) => r.isPast);

  const upcomingTotalPages = Math.max(1, Math.ceil(upcomingReservations.length / PAGE_SIZE));
  const pastTotalPages = Math.max(1, Math.ceil(pastReservations.length / PAGE_SIZE));
  const upcomingPageItems = upcomingReservations.slice(upcomingPage * PAGE_SIZE, upcomingPage * PAGE_SIZE + PAGE_SIZE);
  const pastPageItems = pastReservations.slice(pastPage * PAGE_SIZE, pastPage * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="main-content container" style={{ paddingTop: '3rem', paddingBottom: '4rem', maxWidth: '900px' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Calendar size={28} color="var(--accent-secondary)" />
          <span>Mis Reservas</span>
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
          Historial completo de tus partidos y clases en todos los complejos.
        </p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>
          Cargando tus reservas...
        </div>
      ) : reservations.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '4rem 2rem',
          background: 'var(--bg-card)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-subtle)',
        }}>
          <Trophy size={48} color="var(--text-subtle)" style={{ marginBottom: '1rem' }} />
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            Aún no tienes turnos reservados
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '400px', margin: '0 auto 1.5rem auto' }}>
            Explora el catálogo de complejos y asegura tu cancha para jugar con amigos.
          </p>
          <Link to="/" className="btn btn-lime">
            <Sparkles size={16} />
            <span>Buscar Complejos y Reservar</span>
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
          {/* Upcoming Reservations */}
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '1rem', color: '#ffffff' }}>
              Próximos partidos
            </h2>

            {upcomingReservations.length === 0 ? (
              <div style={{
                padding: '1.5rem',
                background: 'var(--bg-card)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-muted)',
                fontSize: '0.9rem',
                border: '1px solid var(--border-subtle)',
              }}>
                No tienes turnos próximos programados.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {upcomingPageItems.map((res) => {
                  return (
                    <div
                      key={res.id}
                      className="card"
                      style={{
                        padding: '1.5rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '1rem',
                        borderLeft: '4px solid var(--accent-secondary)',
                      }}
                    >
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        flexWrap: 'wrap',
                        gap: '0.75rem',
                      }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                            <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#ffffff' }}>
                              {res.complexName}
                            </h3>
                            <span className="badge badge-role" style={{ fontSize: '0.7rem' }}>
                              {res.type === 'CLASS' ? 'Clase' : res.role === 'PLAYER_JOINED' ? 'Me sumé' : 'Turno Libre'}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--accent-secondary)' }}>
                            {res.courtName}
                          </div>
                        </div>

                        {res.paymentStatus && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <PaymentStatusBadge status={res.paymentStatus} pendingLabel="PENDIENTE DE PAGO" />
                          </div>
                        )}
                      </div>

                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                        gap: '1rem',
                        background: 'var(--bg-surface)',
                        padding: '0.85rem 1rem',
                        borderRadius: 'var(--radius-md)',
                        fontSize: '0.85rem',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Calendar size={16} color="var(--accent-primary)" />
                          <span style={{ fontWeight: 700 }}>{res.date}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Clock size={16} color="var(--accent-cyan)" />
                          <span style={{ fontWeight: 700 }}>{res.startTime} - {res.endTime} hs</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <DollarSign size={16} color="var(--accent-secondary)" />
                          <span style={{ fontWeight: 800 }}>${res.price.toLocaleString('es-AR')}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <MapPin size={16} color="var(--text-muted)" />
                          <span style={{ color: 'var(--text-muted)' }}>{res.complexAddress}</span>
                        </div>
                      </div>

                      <MyOpenMatchPanel reservation={res} onChanged={fetchMyReservations} />

                      {res.role === 'BOOKER' && (
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '0.75rem',
                        borderTop: '1px solid var(--border-subtle)',
                        paddingTop: '0.75rem',
                      }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {res.loadedByComplex
                            ? `La cargó el complejo con tu email: para cancelarla hablá con el complejo${res.complexPhone ? ` al ${res.complexPhone}` : ''}.`
                            : res.canCancel
                            ? res.cancellationHours > 0 && res.type === 'PLAYER'
                              ? `Podés cancelar desde la app hasta el ${shortDateLabel(res.cancelDeadline.date)} a las ${res.cancelDeadline.time} hs.`
                              : 'Podés cancelar hasta que empiece el turno.'
                            : `Ya pasó el plazo para cancelar desde la app (${res.cancellationHours} h antes). Hablá con el complejo${res.complexPhone ? ` al ${res.complexPhone}` : ''}.`}
                        </span>
                        {res.canCancel ? (
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleCancelReservation(res.id)}
                          >
                            <Trash2 size={14} />
                            <span>Cancelar reserva</span>
                          </button>
                        ) : (
                          <WhatsappButton
                            phone={res.complexPhone}
                            label="Escribir al complejo"
                            text={`Hola! Tengo un turno el ${shortDateLabel(res.date)} a las ${res.startTime} en ${res.courtName} y necesito cancelarlo.`}
                          />
                        )}
                      </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <Pagination page={upcomingPage} totalPages={upcomingTotalPages} onChange={setUpcomingPage} />
          </div>

          {/* Past Reservations */}
          {pastReservations.length > 0 && (
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: '1rem', color: 'var(--text-muted)' }}>
                Historial de turnos pasados
              </h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', opacity: 0.75 }}>
                {pastPageItems.map((res) => (
                  <div
                    key={res.id}
                    className="card"
                    style={{
                      padding: '1rem 1.25rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '0.85rem',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700 }}>{res.complexName} • {res.courtName}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                        {res.date} ({res.startTime} hs)
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <span style={{ fontWeight: 700 }}>${res.price.toLocaleString('es-AR')}</span>
                      {res.paymentStatus ? <PaymentStatusBadge status={res.paymentStatus} /> : <span className="badge badge-role">Me sumé</span>}
                    </div>
                  </div>
                ))}
              </div>
              <Pagination page={pastPage} totalPages={pastTotalPages} onChange={setPastPage} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
