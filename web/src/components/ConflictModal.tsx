import React from 'react';
import { AlertTriangle, X, CheckCircle2, Trash2, GraduationCap, User as UserIcon, Repeat } from 'lucide-react';
import { DAY_NAMES, DAY_NAMES_SHORT } from '../lib/dates';
import type { CourtsConflictData } from '../types';

interface ConflictModalProps {
  data: CourtsConflictData;
  onResolve: (decision: 'KEEP' | 'CANCEL') => void;
  onClose: () => void;
  loading: boolean;
}

// Copy for each kind of conflict the courts save can report.
const COPY: Record<string, { keep: string; cancel: string }> = {
  COURT_DELETION: {
    keep: 'Eliminar la cancha de todas formas',
    cancel: 'Cancelar estas reservas y eliminar la cancha',
  },
  RANGE_CHANGE: {
    keep: 'Conservar estas reservas y aplicar el nuevo horario al resto',
    cancel: 'Cancelar estas reservas y aplicar el nuevo horario',
  },
};

const listBox: React.CSSProperties = {
  background: 'var(--bg-surface)',
  borderRadius: 'var(--radius-md)',
  padding: '1rem',
  maxHeight: '220px',
  overflowY: 'auto',
  marginBottom: '1.25rem',
  border: '1px solid var(--border-subtle)',
};

const listTitle: React.CSSProperties = {
  fontSize: '0.75rem',
  fontWeight: 700,
  color: 'var(--text-muted)',
  marginBottom: '0.5rem',
  textTransform: 'uppercase',
};

const listItem: React.CSSProperties = {
  background: 'var(--bg-card)',
  padding: '0.6rem 0.8rem',
  borderRadius: 'var(--radius-sm)',
  fontSize: '0.825rem',
};

/**
 * What a courts change would affect. Class schedules block the save (the
 * professor has to remove them first); reservations and fixed bookings can be
 * resolved by keeping or cancelling the reservations.
 */
export const ConflictModal: React.FC<ConflictModalProps> = ({ data, onResolve, onClose, loading }) => {
  const { conflictType, conflicts, classSchedules, fixedBookings } = data;
  const blocked = conflictType === 'CLASS_SCHEDULES';
  const copy = COPY[conflictType] || COPY.RANGE_CHANGE;

  const title = blocked ? 'Hay clases de profesores en estos turnos' : 'Conflicto con reservas futuras';
  const summary = blocked
    ? 'El cambio modifica turnos que forman parte del horario semanal de un profesor, con alumnos inscriptos.'
    : [
        conflicts.length > 0 && `${conflicts.length} reserva(s) ya confirmada(s)`,
        fixedBookings.length > 0 && `${fixedBookings.length} turno(s) fijo(s)`,
      ]
        .filter(Boolean)
        .join(' y ');

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '620px' }} role="dialog" aria-modal="true" aria-labelledby="conflict-title">
        <button onClick={onClose} aria-label="Cerrar" style={{ position: 'absolute', top: '1.25rem', right: '1.25rem', color: 'var(--text-muted)' }}>
          <X size={20} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', paddingRight: '2rem' }}>
          <div style={{
            width: '44px',
            height: '44px',
            flexShrink: 0,
            borderRadius: '12px',
            background: 'rgba(239, 93, 99, 0.15)',
            color: 'var(--status-blocked)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <AlertTriangle size={24} />
          </div>
          <div>
            <h3 id="conflict-title" style={{ fontSize: '1.25rem', fontWeight: 800 }}>{title}</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              {blocked ? summary : <>Los cambios que deseas guardar afectan a <strong>{summary}</strong>.</>}
            </p>
          </div>
        </div>

        {classSchedules.length > 0 && (
          <div style={listBox}>
            <div style={listTitle}>Horarios de clases afectados:</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {classSchedules.map((cs) => (
                <div key={cs.classScheduleId} style={listItem}>
                  <div style={{ fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <GraduationCap size={14} /> {cs.professorName}
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                    {cs.courtName} • {cs.daysOfWeek.map((d) => DAY_NAMES_SHORT[d]).join(', ')} • {cs.startTime} a {cs.endTime}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {conflicts.length > 0 && (
          <div style={listBox}>
            <div style={listTitle}>Reservas afectadas:</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {conflicts.map((c) => (
                <div key={c.reservationId} style={listItem}>
                  <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                    {c.courtName} • {c.date} ({c.time})
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                    <span>A nombre de: <strong>{c.guestName}</strong></span>
                    {c.type === 'CLASS' ? <GraduationCap size={13} /> : <UserIcon size={13} />}
                    <span>{c.type === 'CLASS' ? '(Clase)' : '(Jugador)'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {fixedBookings.length > 0 && (
          <div style={listBox}>
            <div style={listTitle}>Turnos fijos que se dan de baja:</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {fixedBookings.map((fb) => (
                <div key={fb.fixedBookingId} style={listItem}>
                  <div style={{ fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Repeat size={13} /> {fb.guestName}
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                    {fb.courtName} • {DAY_NAMES[fb.dayOfWeek]} {fb.startTime}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
          {blocked
            ? 'Pedile al profesor que quite o rehaga su horario de clases desde su panel, y después volvé a guardar los cambios de canchas.'
            : fixedBookings.length > 0
            ? 'Esos turnos fijos quedan sin horario en la cancha, así que se dan de baja en cualquiera de las dos opciones. ¿Cómo querés continuar con las reservas?'
            : conflictType === 'COURT_DELETION'
            ? 'Una cancha eliminada no puede conservar reservas futuras: se cancelan. Su historial se conserva. ¿Querés continuar?'
            : '¿Cómo querés resolver este conflicto antes de guardar los cambios de canchas?'}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {!blocked && (
            <>
              <button className="btn btn-primary" disabled={loading} onClick={() => onResolve('KEEP')} style={{ width: '100%', justifyContent: 'center' }}>
                <CheckCircle2 size={18} />
                <span>{copy.keep}</span>
              </button>
              <button className="btn btn-danger" disabled={loading} onClick={() => onResolve('CANCEL')} style={{ width: '100%', justifyContent: 'center' }}>
                <Trash2 size={18} />
                <span>{copy.cancel}</span>
              </button>
            </>
          )}
          <button className="btn btn-secondary" disabled={loading} onClick={onClose} style={{ width: '100%', justifyContent: 'center' }}>
            {blocked ? 'Entendido' : 'Volver sin guardar'}
          </button>
        </div>
      </div>
    </div>
  );
};
