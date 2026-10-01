import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, ApiError } from '../api/client';
import { X, Calendar, Clock, DollarSign, CheckCircle, AlertCircle, Sparkles, GraduationCap, Info, LogIn, UserPlus, User as UserIcon } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import type { PublicTurn, OpenMatchInput } from '../types';
import { OpenMatchFields } from './openMatch/OpenMatchFields';

interface ReservationModalProps {
  turn: PublicTurn;
  complexName: string;
  complexId: string;
  isApprovedProfessor?: boolean;
  /** Players can cancel from the app up to this many hours before (0 = until it starts). */
  cancellationHours?: number;
  onSuccess: () => void;
  onClose: () => void;
}

export const ReservationModal: React.FC<ReservationModalProps> = ({
  turn,
  complexName,
  isApprovedProfessor = false,
  cancellationHours = 0,
  onSuccess,
  onClose,
}) => {
  const { user, updateProfile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // The owner books on behalf of a client and types their data; everyone
  // else books with their own account (the server ignores anything else).
  const isOwner = user?.role === 'DUEÑO';
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState(isOwner ? '' : user?.phone || '');
  const [guestEmail, setGuestEmail] = useState('');
  // Accounts created without a phone give one once, saved to the profile.
  const needsPhone = !isOwner && !user?.phone;
  const [isClass, setIsClass] = useState(isApprovedProfessor && user?.role === 'PROFESOR');
  const [notes, setNotes] = useState('');
  const [wantsPlayers, setWantsPlayers] = useState(false);
  const [openMatch, setOpenMatch] = useState<OpenMatchInput>({ spots: 1, category: null, notes: '' });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  // Back to this same turn after logging in or signing up.
  const goToAuth = (mode: 'login' | 'register') => {
    const back = `${location.pathname}?fecha=${turn.date}&turno=${turn.id}`;
    navigate(`/auth?mode=${mode}&redirect=${encodeURIComponent(back)}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isOwner && (!guestName.trim() || !guestPhone.trim())) {
      setError('Ingresá el nombre y el teléfono del cliente.');
      return;
    }
    if (needsPhone && guestPhone.trim().length < 6) {
      setError('Ingresá tu teléfono para que el complejo pueda contactarte.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (needsPhone) await updateProfile({ phone: guestPhone.trim() });
      await api.reservations.create(turn.id, {
        ...(isOwner ? { guestName, guestPhone, guestEmail: guestEmail || undefined } : {}),
        type: isClass ? 'CLASS' : 'PLAYER',
        notes: notes || undefined,
        openMatch: user && !isClass && wantsPlayers ? { ...openMatch, notes: openMatch.notes?.trim() || null } : undefined,
      });

      setConfirmed(true);
      onSuccess();
    } catch (err: any) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('No se pudo completar la reserva. Por favor intenta nuevamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <button onClick={onClose} aria-label="Cerrar" className="icon-btn modal-close">
          <X size={20} />
        </button>

        {!user ? (
          <div style={{ textAlign: 'center', padding: '0.5rem 0' }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: 'rgba(58, 122, 240, 0.15)',
              color: 'var(--accent-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1rem auto',
            }}>
              <LogIn size={28} />
            </div>
            <h3 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '0.5rem' }}>Iniciá sesión para reservar</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              {turn.court.name} · {turn.date} · {turn.startTime} hs. Crear la cuenta lleva un minuto y después reservás con un clic.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <button className="btn btn-primary" onClick={() => goToAuth('login')} style={{ width: '100%', justifyContent: 'center' }}>
                <LogIn size={16} />
                <span>Iniciar sesión</span>
              </button>
              <button className="btn btn-secondary" onClick={() => goToAuth('register')} style={{ width: '100%', justifyContent: 'center' }}>
                <UserPlus size={16} />
                <span>Crear cuenta</span>
              </button>
            </div>
          </div>
        ) : !confirmed ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.25rem', paddingRight: '2rem' }}>
              <div style={{
                flexShrink: 0,
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'rgba(58, 122, 240, 0.15)',
                color: 'var(--accent-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Calendar size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.3rem', fontWeight: 800 }}>Confirmar reserva de turno</h3>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{complexName}</div>
              </div>
            </div>

            {/* Turn Details Summary Card */}
            <div style={{
              background: 'var(--bg-surface)',
              borderRadius: 'var(--radius-md)',
              padding: '1rem',
              marginBottom: '1.25rem',
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '0.75rem',
              border: '1px solid var(--border-subtle)',
            }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Cancha</div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#ffffff' }}>{turn.court.name}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Fecha</div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#ffffff' }}>{turn.date}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Clock size={16} color="var(--accent-cyan)" />
                <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{turn.startTime} - {turn.endTime} hs</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <DollarSign size={16} color="var(--accent-secondary)" />
                <span style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--accent-secondary)' }}>
                  ${turn.price.toLocaleString('es-AR')}
                </span>
              </div>
            </div>

            {error && (
              <div style={{
                background: 'rgba(239, 93, 99, 0.15)',
                border: '1px solid rgba(239, 93, 99, 0.3)',
                borderRadius: 'var(--radius-md)',
                padding: '0.75rem 1rem',
                color: '#ff8489',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '1.25rem',
              }}>
                <AlertCircle size={18} />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              {isApprovedProfessor && user?.role === 'PROFESOR' && (
                <div style={{
                  background: 'rgba(242, 165, 61, 0.1)',
                  border: '1px solid rgba(242, 165, 61, 0.3)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.75rem 1rem',
                  marginBottom: '1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <GraduationCap size={18} color="var(--accent-secondary)" />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>Reserva como Profesor</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Se registrará como clase dictada</div>
                    </div>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={isClass}
                      onChange={(e) => setIsClass(e.target.checked)}
                      style={{ flexShrink: 0, accentColor: 'var(--accent-secondary)', width: '16px', height: '16px' }}
                    />
                    <span style={{ fontSize: '0.825rem', fontWeight: 600 }}>Es clase</span>
                  </label>
                </div>
              )}

              {isOwner ? (
                <>
                  <div className="form-group">
                    <label className="form-label">Nombre y Apellido del cliente *</label>
                    <input
                      type="text"
                      className="form-input"
                      required
                      placeholder="Ej: Juan Pérez"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                    />
                  </div>

                  <div className="form-row-2">
                    <div className="form-group">
                      <label className="form-label">Teléfono / WhatsApp *</label>
                      <input
                        type="tel"
                        className="form-input"
                        required
                        placeholder="Ej: 291 4567890"
                        value={guestPhone}
                        onChange={(e) => setGuestPhone(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Email (opcional)</label>
                      <input
                        type="email"
                        className="form-input"
                        placeholder="usuario@email.com"
                        value={guestEmail}
                        onChange={(e) => setGuestEmail(e.target.value)}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.75rem 1rem',
                    marginBottom: '1.25rem',
                    fontSize: '0.875rem',
                  }}>
                    <UserIcon size={16} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                    <span>
                      Reservás como <strong>{user.name}</strong>
                      {user.phone ? <> · {user.phone}</> : null}
                    </span>
                  </div>
                  {needsPhone && (
                    <div className="form-group">
                      <label className="form-label">Tu teléfono / WhatsApp *</label>
                      <input
                        type="tel"
                        className="form-input"
                        required
                        placeholder="Ej: 291 4567890"
                        value={guestPhone}
                        onChange={(e) => setGuestPhone(e.target.value)}
                      />
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Lo guardamos en tu perfil para que el complejo pueda contactarte.</span>
                    </div>
                  )}
                </>
              )}

              <div className="form-group">
                <label className="form-label">Notas o comentarios (opcional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ej: Llevamos paletas propias / Nivel 5ta"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              {!isOwner && !isClass && (
                <div style={{
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.75rem 1rem',
                  marginBottom: '1.25rem',
                }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={wantsPlayers}
                      onChange={(e) => setWantsPlayers(e.target.checked)}
                      style={{ flexShrink: 0, accentColor: 'var(--accent-secondary)', width: '16px', height: '16px' }}
                    />
                    <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>Me faltan jugadores</span>
                  </label>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.25rem 0 0 1.5rem' }}>
                    Publicamos tu partido en “Partidos abiertos” y te avisamos por email cuando se sume alguien.
                  </div>
                  {wantsPlayers && (
                    <div style={{ marginTop: '0.85rem' }}>
                      <OpenMatchFields value={openMatch} onChange={setOpenMatch} />
                    </div>
                  )}
                </div>
              )}

              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.5rem',
                background: 'rgba(255, 255, 255, 0.04)',
                borderRadius: 'var(--radius-md)',
                padding: '0.75rem',
                fontSize: '0.78rem',
                color: 'var(--text-muted)',
                marginBottom: '1.5rem',
                lineHeight: 1.4,
              }}>
                <Info size={14} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
                <span>
                  La reserva es libre e inmediata. El cobro se hace directamente en el complejo.{' '}
                  {cancellationHours > 0
                    ? `Podés cancelar desde la app hasta ${cancellationHours} h antes del turno.`
                    : 'Podés cancelar desde la app hasta que empiece el turno.'}
                </span>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={onClose}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-lime modal-actions-main"
                  disabled={loading}
                >
                  <Sparkles size={16} />
                  <span>{loading ? 'Confirmando...' : 'Confirmar reserva'}</span>
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'rgba(58, 122, 240, 0.2)',
              color: 'var(--accent-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.25rem auto',
            }}>
              <CheckCircle size={36} />
            </div>

            <h3 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.5rem', color: '#ffffff' }}>
              ¡Tu turno está reservado!
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.925rem', marginBottom: '1.5rem' }}>
              Te esperamos el <strong>{turn.date}</strong> a las <strong>{turn.startTime} hs</strong> en <strong>{turn.court.name}</strong> ({complexName}).
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {!isOwner && (
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    onClose();
                    navigate('/my-reservations');
                  }}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  Ver mis reservas
                </button>
              )}

              <button
                className="btn btn-secondary"
                onClick={onClose}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                Cerrar y seguir navegando
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
