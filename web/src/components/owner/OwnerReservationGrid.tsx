import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Lock, Trophy, Repeat, GraduationCap, RefreshCw, Users } from 'lucide-react';
import { api } from '../../api/client';
import { DatePillStrip } from '../DatePillStrip';
import { Banner } from '../Banner';
import { TurnActionModal } from './TurnActionModal';
import { addDays, hasStarted, todayStr, shortDateLabel } from '../../lib/dates';
import { buildCourtSlots, toMinutes } from '../../lib/slots';
import type { Court, OwnerTurn } from '../../types';

interface OwnerReservationGridProps {
  complexId: string;
  /** Bump to force a reload (e.g. after courts or fixed bookings change elsewhere on the page). */
  refreshKey: number;
  /** Called after any change made from the grid, so the page can refresh its totals. */
  onChanged: () => void;
}

const DAYS_BACK = 7;
const DAYS_AHEAD = 13; // today + 13 = two weeks

const LEGEND = [
  { label: 'Disponible', color: 'var(--status-available)' },
  { label: 'Reservado', color: 'var(--accent-primary)' },
  { label: 'Clase', color: 'var(--accent-cyan)' },
  { label: 'Turno fijo', color: 'var(--accent-secondary)' },
  { label: 'Torneo', color: 'var(--status-tournament)' },
  { label: 'Bloqueado', color: 'var(--status-blocked)' },
];

function cellClass(turn: OwnerTurn): string {
  if (turn.state === 'OCCUPIED') {
    if (turn.reservation?.fixedBookingId) return 'og-fixed';
    if (turn.reservation?.type === 'CLASS') return 'og-class';
    return 'og-occupied';
  }
  if (turn.state === 'TOURNAMENT') return 'og-tournament';
  if (turn.state === 'BLOCKED') return 'og-blocked';
  return 'og-available';
}

/**
 * The owner's reservations grid: courts x time slots for one concrete date,
 * with one week back (review) and two weeks ahead. Shows player bookings,
 * fixed bookings, classes, tournaments and blocks; clicking a cell opens the
 * actions for that turn.
 */
export const OwnerReservationGrid: React.FC<OwnerReservationGridProps> = ({ complexId, refreshKey, onChanged }) => {
  const today = todayStr();
  const rangeFrom = addDays(today, -DAYS_BACK);
  const rangeTo = addDays(today, DAYS_AHEAD);

  const [selectedDate, setSelectedDate] = useState(today);
  const [courts, setCourts] = useState<Court[]>([]);
  const [turns, setTurns] = useState<OwnerTurn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTurnId, setSelectedTurnId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.schedules.getOwnerTurns(complexId, rangeFrom, rangeTo);
      setCourts(res.courts || []);
      setTurns(res.turns || []);
    } catch (err: any) {
      setError(err.message || 'Error al cargar la grilla de reservas.');
    } finally {
      setLoading(false);
    }
  }, [complexId, rangeFrom, rangeTo]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load, refreshKey]);

  const dayTurns = useMemo(() => turns.filter((t) => t.date === selectedDate), [turns, selectedDate]);

  // Columns: every court's current slots, plus any start time that exists on
  // this date anyway (a reservation kept outside a changed range, or a past
  // day generated with an older range).
  const columns = useMemo(() => {
    const starts = new Set<string>();
    for (const court of courts) for (const slot of buildCourtSlots(court)) starts.add(slot.start);
    for (const t of dayTurns) starts.add(t.startTime);
    return Array.from(starts).sort((a, b) => toMinutes(a) - toMinutes(b));
  }, [courts, dayTurns]);

  const turnAt = useMemo(() => {
    const map = new Map<string, OwnerTurn>();
    for (const t of dayTurns) map.set(`${t.courtId}_${t.startTime}`, t);
    return map;
  }, [dayTurns]);

  const isPast = selectedDate < today;
  const selectedTurn = selectedTurnId ? turns.find((t) => t.id === selectedTurnId) || null : null;

  const occupied = dayTurns.filter((t) => t.state === 'OCCUPIED').length;
  const available = dayTurns.filter((t) => t.state === 'AVAILABLE').length;

  const handleChanged = () => {
    load();
    onChanged();
  };

  return (
    <div>
      {selectedTurn && (
        <TurnActionModal
          complexId={complexId}
          turn={selectedTurn}
          courtName={courts.find((c) => c.id === selectedTurn.courtId)?.name || selectedTurn.court.name}
          isPast={hasStarted(selectedTurn.date, selectedTurn.startTime)}
          onChanged={handleChanged}
          onClose={() => setSelectedTurnId(null)}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
        <div>
          <h2 className="panel-section-title" style={{ fontSize: '1.5rem' }}>Panel de Reservas</h2>
          <p className="panel-section-sub">
            Hacé clic en un turno para reservarlo, bloquearlo, marcarlo como torneo o gestionar su cobro.
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => { setLoading(true); load(); }} disabled={loading}>
          <RefreshCw size={14} />
          <span>Actualizar</span>
        </button>
      </div>

      <DatePillStrip from={rangeFrom} count={DAYS_BACK + DAYS_AHEAD + 1} selected={selectedDate} onSelect={setSelectedDate} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', margin: '0.75rem 0 1rem' }}>
        <div style={{ fontSize: '0.9rem' }}>
          <strong>{shortDateLabel(selectedDate)}</strong>
          <span style={{ color: 'var(--text-muted)' }}>
            {' '}· {occupied} reservados · {available} libres{isPast ? ' · día pasado (solo lectura, salvo cobros)' : ''}
          </span>
        </div>
        <div className="og-legend">
          {LEGEND.map((item) => (
            <span key={item.label} className="og-legend-item">
              <span className="og-swatch" style={{ '--og-color': item.color } as React.CSSProperties} />
              {item.label}
            </span>
          ))}
        </div>
      </div>

      {error && <Banner type="error" text={error} marginBottom="1rem" />}

      {loading && turns.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>Cargando grilla de reservas...</div>
      ) : courts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>
          No hay canchas configuradas. Agregalas en “Canchas y horarios”, más abajo.
        </div>
      ) : (
        <div className={`og-wrap ${isPast ? 'og-past' : ''}`}>
          <table className="og-table">
            <thead>
              <tr>
                <th className="og-court">CANCHA</th>
                {columns.map((start) => (
                  <th key={start}>{start}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {courts.map((court) => (
                <tr key={court.id}>
                  <td className="og-court">{court.name}</td>
                  {columns.map((start) => {
                    const turn = turnAt.get(`${court.id}_${start}`);
                    if (!turn) {
                      return (
                        <td key={start}>
                          <div className="og-empty" aria-hidden="true" />
                        </td>
                      );
                    }
                    const r = turn.reservation;
                    return (
                      <td key={start}>
                        <button
                          className={`og-cell ${cellClass(turn)}`}
                          onClick={() => setSelectedTurnId(turn.id)}
                          aria-label={`${court.name} ${turn.startTime}: ${r ? r.guestName : turn.state}`}
                        >
                          {turn.state === 'OCCUPIED' && r ? (
                            <>
                              <span className="og-cell-title">
                                {r.fixedBookingId && <Repeat size={11} />}
                                {r.type === 'CLASS' && <GraduationCap size={11} />}
                                {r.openMatch && <Users size={11} aria-label="Partido abierto" />}
                                {r.guestName}
                              </span>
                              <span className={`badge ${r.paymentStatus === 'PAID' ? 'badge-paid' : 'badge-pending'}`} style={{ fontSize: '0.62rem', padding: '0.1rem 0.35rem' }}>
                                {r.paymentStatus === 'PAID' ? 'PAGADO' : 'PENDIENTE'}
                              </span>
                            </>
                          ) : turn.state === 'TOURNAMENT' ? (
                            <>
                              <span className="og-cell-title"><Trophy size={11} /> {turn.label || 'Torneo'}</span>
                              <span className="og-cell-sub">hasta {turn.endTime}</span>
                            </>
                          ) : turn.state === 'BLOCKED' ? (
                            <>
                              <span className="og-cell-title"><Lock size={11} /> {turn.label || 'Bloqueado'}</span>
                              <span className="og-cell-sub">hasta {turn.endTime}</span>
                            </>
                          ) : (
                            <>
                              <span className="og-cell-title" style={{ color: 'var(--accent-secondary)' }}>
                                ${turn.price.toLocaleString('es-AR')}
                              </span>
                              <span className="og-cell-sub">Libre · hasta {turn.endTime}</span>
                            </>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
