import React, { useState } from 'react';
import { X, Lock, Unlock, Trophy, Sparkles, Trash2, Repeat, GraduationCap, Phone, Check, Users } from 'lucide-react';
import { api } from '../../api/client';
import { Banner } from '../Banner';
import { PaymentStatusBadge } from '../PaymentStatusBadge';
import { shortDateLabel } from '../../lib/dates';
import type { OwnerTurn } from '../../types';

interface TurnActionModalProps {
  complexId: string;
  turn: OwnerTurn;
  courtName: string;
  isPast: boolean;
  onChanged: () => void;
  onClose: () => void;
}

const STATE_LABEL: Record<OwnerTurn['state'], string> = {
  AVAILABLE: 'Disponible',
  OCCUPIED: 'Reservado',
  BLOCKED: 'Bloqueado',
  TOURNAMENT: 'Torneo',
};

const STATE_BADGE: Record<OwnerTurn['state'], string> = {
  AVAILABLE: 'badge-available',
  OCCUPIED: 'badge-occupied',
  BLOCKED: 'badge-blocked',
  TOURNAMENT: 'badge-tournament',
};

/** What the owner can do with one turn of the reservations grid, depending on its state. */
export const TurnActionModal: React.FC<TurnActionModalProps> = ({ complexId, turn, courtName, isPast, onChanged, onClose }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [price, setPrice] = useState(String(turn.price));
  const [tournamentLabel, setTournamentLabel] = useState(turn.label || '');
  const [showTournamentForm, setShowTournamentForm] = useState(false);

  const reservation = turn.reservation;

  const run = async (action: () => Promise<unknown>, closeAfter = true) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
      if (closeAfter) onClose();
    } catch (err: any) {
      setError(err.message || 'No se pudo completar la acción.');
    } finally {
      setBusy(false);
    }
  };

  const setState = (state: 'AVAILABLE' | 'BLOCKED' | 'TOURNAMENT', label?: string) =>
    run(() => api.turns.update(complexId, turn.id, { state, ...(label !== undefined ? { label } : {}) }));

  const handleBook = (e: React.FormEvent) => {
    e.preventDefault();
    if (guestName.trim().length < 2 || guestPhone.trim().length < 6) {
      setError('Ingresá el nombre y un teléfono válido del cliente.');
      return;
    }
    run(() => api.reservations.create(turn.id, { guestName, guestPhone, notes: notes || undefined, type: 'PLAYER' }));
  };

  const handleSavePrice = () => {
    const value = Number(price);
    if (Number.isNaN(value) || value < 0) {
      setError('El precio no es válido.');
      return;
    }
    run(() => api.turns.update(complexId, turn.id, { price: value }), false);
  };

  const handleTogglePayment = () => {
    if (!reservation) return;
    const next = reservation.paymentStatus === 'PAID' ? 'PENDING' : 'PAID';
    run(() => api.reservations.updatePayment(reservation.id, { status: next }), false);
  };

  const handleCancel = () => {
    if (!reservation) return;
    const msg = reservation.fixedBookingId
      ? '¿Cancelar esta reserva? Es un turno fijo: solo se libera esta fecha, las demás semanas siguen reservadas.'
      : reservation.classScheduleId
      ? '¿Cancelar esta clase? Es parte del horario semanal del profesor: solo se libera esta fecha y no se les cobra a sus alumnos.'
      : '¿Cancelar esta reserva y liberar el turno?';
    if (!confirm(msg)) return;
    run(() => api.reservations.cancel(reservation.id));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button onClick={onClose} aria-label="Cerrar" className="icon-btn modal-close">
          <X size={20} />
        </button>

        {/* Turn summary */}
        <div style={{ marginBottom: '1.25rem', paddingRight: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
            <span className={`badge ${STATE_BADGE[turn.state]}`}>{STATE_LABEL[turn.state]}</span>
            {reservation?.fixedBookingId && (
              <span className="badge badge-pending"><Repeat size={11} /> Turno fijo</span>
            )}
            {reservation?.type === 'CLASS' && (
              <span className="badge badge-role"><GraduationCap size={11} /> Clase</span>
            )}
          </div>
          <h3 style={{ fontSize: '1.3rem', fontWeight: 800 }}>{courtName}</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            {shortDateLabel(turn.date)} · {turn.startTime} a {turn.endTime} hs · ${turn.price.toLocaleString('es-AR')}
          </p>
          {turn.state === 'TOURNAMENT' && turn.label && (
            <p style={{ color: '#c4b5fd', fontSize: '0.875rem', fontWeight: 700, marginTop: '0.25rem' }}>
              <Trophy size={13} style={{ verticalAlign: '-2px' }} /> {turn.label}
            </p>
          )}
        </div>

        {error && <Banner type="error" text={error} marginBottom="1rem" />}

        {isPast && turn.state !== 'OCCUPIED' && (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Este turno ya comenzó: solo lectura.</p>
        )}

        {/* Reserved turn: client, payment, cancel */}
        {reservation && (
          <div>
            <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', padding: '0.9rem 1rem', marginBottom: '1rem' }}>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>{reservation.guestName}</div>
              {reservation.guestPhone && (
                <a href={`tel:${reservation.guestPhone}`} style={{ color: 'var(--text-muted)', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Phone size={13} /> {reservation.guestPhone}
                </a>
              )}
              {reservation.user?.email && (
                <div style={{ color: 'var(--text-subtle)', fontSize: '0.8rem' }}>{reservation.user.email}</div>
              )}
              {reservation.notes && (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.4rem' }}>“{reservation.notes}”</div>
              )}
              {reservation.openMatch && (
                <div style={{ marginTop: '0.6rem', paddingTop: '0.6rem', borderTop: '1px solid var(--border-subtle)', fontSize: '0.8rem' }}>
                  <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Users size={13} color="var(--accent-secondary)" />
                    Partido abierto {reservation.openMatch.joinedCount}/{reservation.openMatch.spots}
                    {reservation.openMatch.category && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>· {reservation.openMatch.category}</span>}
                  </div>
                  {reservation.openMatch.players.length > 0 && (
                    <div style={{ color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      Se sumaron: {reservation.openMatch.players.map((p) => p.name).join(', ')}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                Cobro: <strong style={{ color: 'var(--accent-secondary)' }}>${reservation.paymentAmount.toLocaleString('es-AR')}</strong>
              </span>
              <PaymentStatusBadge status={reservation.paymentStatus} onClick={busy ? undefined : handleTogglePayment} paidIcon={<Check size={12} />} />
            </div>

            {!isPast && (
              <button className="btn btn-danger" disabled={busy} onClick={handleCancel} style={{ width: '100%', justifyContent: 'center' }}>
                <Trash2 size={16} />
                <span>Cancelar reserva</span>
              </button>
            )}
          </div>
        )}

        {/* Free turn: book by hand, block, tournament, price */}
        {!isPast && turn.state === 'AVAILABLE' && (
          <div>
            <form onSubmit={handleBook} style={{ marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                Reservar a nombre de un cliente
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.6rem' }}>
                <input className="form-input" placeholder="Nombre" value={guestName} onChange={(e) => setGuestName(e.target.value)} aria-label="Nombre del cliente" />
                <input className="form-input" placeholder="Teléfono" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} aria-label="Teléfono del cliente" />
              </div>
              <input className="form-input" placeholder="Nota (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} style={{ marginTop: '0.6rem' }} aria-label="Nota" />
              <button type="submit" className="btn btn-lime" disabled={busy} style={{ width: '100%', justifyContent: 'center', marginTop: '0.6rem' }}>
                <Sparkles size={16} />
                <span>Marcar como reservado</span>
              </button>
            </form>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Precio de este turno</span>
              <input
                type="number"
                step="any"
                min="0"
                className="form-input"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                style={{ padding: '0.4rem 0.6rem' }}
                aria-label="Precio de este turno"
              />
              <button className="btn btn-secondary btn-sm" disabled={busy || Number(price) === turn.price} onClick={handleSavePrice}>
                Guardar
              </button>
            </div>
          </div>
        )}

        {!isPast && turn.state !== 'OCCUPIED' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {turn.state !== 'AVAILABLE' && (
              <button className="btn btn-primary" disabled={busy} onClick={() => setState('AVAILABLE')} style={{ justifyContent: 'center' }}>
                <Unlock size={16} />
                <span>Marcar como disponible</span>
              </button>
            )}
            {turn.state !== 'BLOCKED' && (
              <button className="btn btn-secondary" disabled={busy} onClick={() => setState('BLOCKED')} style={{ justifyContent: 'center' }}>
                <Lock size={16} />
                <span>Bloquear turno</span>
              </button>
            )}
            {showTournamentForm || turn.state === 'TOURNAMENT' ? (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  className="form-input"
                  placeholder="Nombre del torneo (opcional)"
                  value={tournamentLabel}
                  onChange={(e) => setTournamentLabel(e.target.value)}
                  aria-label="Nombre del torneo"
                />
                <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setState('TOURNAMENT', tournamentLabel)} style={{ whiteSpace: 'nowrap' }}>
                  <Trophy size={14} />
                  <span>{turn.state === 'TOURNAMENT' ? 'Guardar' : 'Marcar torneo'}</span>
                </button>
              </div>
            ) : (
              <button className="btn btn-secondary" disabled={busy} onClick={() => setShowTournamentForm(true)} style={{ justifyContent: 'center' }}>
                <Trophy size={16} />
                <span>Marcar como torneo</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
