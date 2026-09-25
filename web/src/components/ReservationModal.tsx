import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, ApiError } from '../api/client';
import { X, Calendar, Clock, DollarSign, CheckCircle, AlertCircle, Sparkles, GraduationCap, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Turn } from '../types';

interface ReservationModalProps {
  turn: Turn;
  complexName: string;
  complexId: string;
  isApprovedProfessor?: boolean;
  onSuccess: () => void;
  onClose: () => void;
}

export const ReservationModal: React.FC<ReservationModalProps> = ({
  turn,
  complexName,
  isApprovedProfessor = false,
  onSuccess,
  onClose,
}) => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [guestName, setGuestName] = useState(user?.name || '');
  const [guestPhone, setGuestPhone] = useState(user?.phone || '');
  const [guestEmail, setGuestEmail] = useState(user?.email || '');
  const [isClass, setIsClass] = useState(isApprovedProfessor && user?.role === 'PROFESOR');
  const [notes, setNotes] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName.trim() || !guestPhone.trim()) {
      setError('Por favor ingresa tu nombre y teléfono de contacto.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await api.reservations.create(turn.id, {
        guestName: isClass ? `Clase - ${user?.name || guestName}` : guestName,
        guestPhone,
        guestEmail: guestEmail || undefined,
        type: isClass ? 'CLASS' : 'PLAYER',
        notes: notes || undefined,
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
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '1.25rem',
            right: '1.25rem',
            color: 'var(--text-muted)',
          }}
        >
          <X size={20} />
        </button>

        {!confirmed ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.25rem' }}>
              <div style={{
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
                      style={{ accentColor: 'var(--accent-secondary)', width: '16px', height: '16px' }}
                    />
                    <span style={{ fontSize: '0.825rem', fontWeight: 600 }}>Es clase</span>
                  </label>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Nombre y Apellido *</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  placeholder="Ej: Juan Pérez"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
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
                <span>La reserva es libre e inmediata. El cobro se hace directamente en el complejo.</span>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={onClose}
                  style={{ flex: 1 }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-lime"
                  disabled={loading}
                  style={{ flex: 2 }}
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
              {user ? (
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
              ) : (
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    onClose();
                    navigate('/auth?mode=register');
                  }}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  Crear cuenta para gestionar mis turnos
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
