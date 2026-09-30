import React, { useState } from 'react';
import { Calendar as CalendarIcon, Sparkles, GraduationCap, Trophy } from 'lucide-react';
import { ReservationModal } from './ReservationModal';
import { hasStarted } from '../lib/dates';
import type { Turn } from '../types';

// Re-exported under this name since ComplexDetailPage.tsx already imports
// PublicTurnData from this module — the shape lives in web/src/types.
export type PublicTurnData = Turn;

interface ScheduleGridProps {
  complexId: string;
  complexName?: string;
  isApprovedProfessor?: boolean;
  turns?: PublicTurnData[];
  onRefreshTurns?: () => void;
}

/** Public turn calendar for players & visitors: one card per court with the selected date's turns. */
export const ScheduleGrid: React.FC<ScheduleGridProps> = ({
  complexId,
  complexName = 'Complejo',
  isApprovedProfessor = false,
  turns = [],
  onRefreshTurns,
}) => {
  const [selectedTurnForBooking, setSelectedTurnForBooking] = useState<PublicTurnData | null>(null);

  // Group turns by court
  const courtsInTurns = Array.from(
    new Set(turns.map((t) => JSON.stringify({ id: t.courtId, name: t.court.name })))
  ).map((s) => JSON.parse(s));

  return (
    <div>
      {selectedTurnForBooking && (
        <ReservationModal
          turn={selectedTurnForBooking}
          complexName={complexName}
          complexId={complexId}
          isApprovedProfessor={isApprovedProfessor}
          onSuccess={() => {
            if (onRefreshTurns) onRefreshTurns();
          }}
          onClose={() => setSelectedTurnForBooking(null)}
        />
      )}

      {turns.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '3rem 1.5rem',
          background: 'var(--bg-card)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-subtle)',
        }}>
          <CalendarIcon size={40} color="var(--text-muted)" style={{ marginBottom: '1rem' }} />
          <h4 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.4rem' }}>
            No hay turnos disponibles para esta fecha
          </h4>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Selecciona otro día en el calendario superior para ver la disponibilidad.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
          {courtsInTurns.map((court) => {
            const courtTurns = turns.filter((t) => t.courtId === court.id);

            return (
              <div
                key={court.id}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '1.5rem',
                }}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '1.25rem',
                  borderBottom: '1px solid var(--border-subtle)',
                  paddingBottom: '0.75rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <div style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      background: 'var(--accent-primary)',
                      boxShadow: '0 0 10px var(--accent-primary)',
                    }} />
                    <h4 style={{ fontSize: '1.15rem', fontWeight: 800 }}>{court.name}</h4>
                  </div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {courtTurns.filter((t) => t.state === 'AVAILABLE' && !hasStarted(t.date, t.startTime)).length} libres
                  </span>
                </div>

                {/* Turns Grid for this court */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(145px, 1fr))',
                  gap: '0.85rem',
                }}>
                  {courtTurns.map((turn) => {
                    // A free turn that already started can't be booked anymore.
                    const isStarted = turn.state === 'AVAILABLE' && hasStarted(turn.date, turn.startTime);
                    const isAvail = turn.state === 'AVAILABLE' && !isStarted;
                    const isOcc = turn.state === 'OCCUPIED';
                    const isTournament = turn.state === 'TOURNAMENT';

                    return (
                      <div
                        key={turn.id}
                        style={{
                          background: isAvail
                            ? 'var(--bg-surface)'
                            : isOcc || isStarted
                            ? 'rgba(118, 136, 163, 0.08)'
                            : isTournament
                            ? 'var(--status-tournament-bg)'
                            : 'rgba(239, 93, 99, 0.06)',
                          border: `1px solid ${
                            isAvail
                              ? 'rgba(52, 199, 149, 0.3)'
                              : isOcc || isStarted
                              ? 'rgba(118, 136, 163, 0.2)'
                              : isTournament
                              ? 'rgba(167, 139, 250, 0.3)'
                              : 'rgba(239, 93, 99, 0.2)'
                          }`,
                          borderRadius: 'var(--radius-md)',
                          padding: '0.85rem',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          gap: '0.5rem',
                          transition: 'all var(--transition-fast)',
                          opacity: isAvail ? 1 : 0.7,
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '0.95rem', color: isAvail ? 'var(--text-main)' : 'var(--text-muted)' }}>
                            {turn.startTime} hs
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            hasta {turn.endTime}
                          </div>
                        </div>

                        <div>
                          <div style={{
                            fontWeight: 800,
                            fontSize: '0.95rem',
                            color: isAvail ? 'var(--accent-secondary)' : 'var(--text-subtle)',
                            marginBottom: '0.4rem',
                          }}>
                            ${turn.price.toLocaleString('es-AR')}
                          </div>

                          {isAvail ? (
                            <button
                              className="btn btn-lime btn-sm"
                              onClick={() => setSelectedTurnForBooking(turn)}
                              style={{ width: '100%', padding: '0.35rem 0.5rem', fontSize: '0.78rem' }}
                            >
                              <Sparkles size={13} />
                              <span>Reservar</span>
                            </button>
                          ) : isStarted ? (
                            <span className="badge badge-occupied" style={{ width: '100%', justifyContent: 'center' }}>
                              Ya comenzó
                            </span>
                          ) : isOcc ? (
                            <span className="badge badge-occupied" style={{ width: '100%', justifyContent: 'center', gap: '0.3rem' }}>
                              {turn.reservation?.type === 'CLASS' ? (<><GraduationCap size={11} /> Clase</>) : 'Ocupado'}
                            </span>
                          ) : isTournament ? (
                            <span className="badge badge-tournament" style={{ width: '100%', justifyContent: 'center', gap: '0.3rem' }} title={turn.label || undefined}>
                              <Trophy size={11} /> Torneo
                            </span>
                          ) : (
                            <span className="badge badge-blocked" style={{ width: '100%', justifyContent: 'center' }}>
                              Bloqueado
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
