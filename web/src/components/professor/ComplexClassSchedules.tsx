import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarPlus, Trash2, ExternalLink, Clock } from 'lucide-react';
import { api } from '../../api/client';
import { Banner } from '../Banner';
import { DAY_NAMES_SHORT, shortDateLabel } from '../../lib/dates';
import { buildCourtSlots, toMinutes } from '../../lib/slots';
import type { ClassSchedule, Complex, Court } from '../../types';

interface ComplexClassSchedulesProps {
  complex: Complex;
  schedules: ClassSchedule[];
  onChanged: () => void;
}

// Monday first, like the rest of the app's week views.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

const minutesLabel = (m: number) => (m >= 24 * 60 ? '24:00' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);

export function formatDays(days: number[]) {
  return WEEK_ORDER.filter((d) => days.includes(d)).map((d) => DAY_NAMES_SHORT[d]).join(', ');
}

/**
 * One linked complex in "Mis complejos": the professor's class schedules
 * there, and the form to book a new one (a court, several weekdays, a time
 * window — every turn inside it is one class).
 */
export const ComplexClassSchedules: React.FC<ComplexClassSchedulesProps> = ({ complex, schedules, onChanged }) => {
  const courts = (complex.courts || []) as Court[];
  const [showForm, setShowForm] = useState(false);
  const [courtId, setCourtId] = useState(courts[0]?.id || '');
  const [days, setDays] = useState<number[]>([]);
  const [startTime, setStartTime] = useState('');
  const [endMinutes, setEndMinutes] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const court = courts.find((c) => c.id === courtId);
  const slots = useMemo(() => (court ? buildCourtSlots(court) : []), [court]);

  // "Hasta" options: the end of each turn from the chosen start onward.
  const endOptions = useMemo(() => {
    if (!court || !startTime) return [];
    return slots
      .filter((s) => toMinutes(s.start) >= toMinutes(startTime))
      .map((s) => toMinutes(s.start) + court.slotMinutes);
  }, [court, slots, startTime]);

  useEffect(() => {
    if (slots.length && !slots.some((s) => s.start === startTime)) setStartTime(slots[0].start);
  }, [slots, startTime]);
  useEffect(() => {
    if (endOptions.length && (endMinutes === null || !endOptions.includes(endMinutes))) setEndMinutes(endOptions[0]);
  }, [endOptions, endMinutes]);

  const classesPerDay = court && startTime && endMinutes !== null ? (endMinutes - toMinutes(startTime)) / court.slotMinutes : 0;

  const toggleDay = (d: number) => setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (days.length === 0) {
      setMessage({ type: 'error', text: 'Elegí al menos un día de la semana.' });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await api.professors.createClassSchedule({
        complexId: complex.id,
        courtId,
        daysOfWeek: days,
        startTime,
        endTime: minutesLabel(endMinutes!),
      });
      const skipped = res.skipped.length
        ? ` Algunos turnos ya estaban ocupados y no se reservaron: ${res.skipped
            .slice(0, 6)
            .map((s) => `${shortDateLabel(s.date)} ${s.startTime}`)
            .join(', ')}${res.skipped.length > 6 ? '…' : ''}.`
        : '';
      setMessage({ type: skipped ? 'error' : 'success', text: `Horario reservado.${skipped}` });
      setShowForm(false);
      setDays([]);
      onChanged();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'No se pudo reservar el horario.' });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (schedule: ClassSchedule) => {
    const label = `${schedule.court.name} · ${formatDays(schedule.daysOfWeek)} · ${schedule.startTime}–${schedule.endTime}`;
    if (!confirm(`¿Eliminar el horario ${label}?\n\nSe liberan las próximas clases en el complejo y sus alumnos dejan de estar inscriptos. Lo ya dictado (y la deuda de los alumnos) se conserva.`)) return;
    setBusy(true);
    setMessage(null);
    try {
      await api.professors.deleteClassSchedule(schedule.id);
      onChanged();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'No se pudo eliminar el horario.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
        <div>
          <h4 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#ffffff' }}>{complex.name}</h4>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{complex.address} • {complex.location}</p>
        </div>
        <Link to={`/${complex.slug}`} className="btn btn-secondary btn-sm" title="Ver página del complejo" style={{ padding: '0.35rem 0.55rem' }}>
          <ExternalLink size={14} />
        </Link>
      </div>

      {message && <Banner type={message.type} text={message.text} marginBottom="0" />}

      {/* Current schedules */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {schedules.length === 0 ? (
          <p style={{ fontSize: '0.85rem', color: 'var(--text-subtle)' }}>Todavía no reservaste horarios de clase acá.</p>
        ) : (
          schedules.map((s) => (
            <div
              key={s.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
                background: 'var(--bg-surface)',
                borderLeft: '3px solid var(--accent-cyan)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.6rem 0.8rem',
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{formatDays(s.daysOfWeek)}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Clock size={11} /> {s.startTime}–{s.endTime} · {s.court.name}
                </div>
              </div>
              <button className="btn btn-danger btn-sm" onClick={() => handleDelete(s)} disabled={busy} title="Eliminar horario" aria-label="Eliminar horario" style={{ padding: '0.3rem 0.5rem' }}>
                <Trash2 size={13} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* New schedule */}
      {showForm ? (
        <form onSubmit={handleCreate} style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', padding: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div>
            <label className="form-label">Cancha</label>
            <select className="form-select" value={courtId} onChange={(e) => setCourtId(e.target.value)}>
              {courts.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.openTime}–{c.closeTime}, turnos de {c.slotMinutes}')</option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label">Días</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }} role="group" aria-label="Días de la semana">
              {WEEK_ORDER.map((d) => {
                const on = days.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleDay(d)}
                    className="btn btn-sm"
                    style={{
                      minWidth: '48px',
                      justifyContent: 'center',
                      background: on ? 'var(--accent-secondary)' : 'var(--bg-card)',
                      color: on ? 'var(--text-inverse)' : 'var(--text-muted)',
                      border: `1px solid ${on ? 'transparent' : 'var(--border-subtle)'}`,
                      fontWeight: on ? 800 : 600,
                    }}
                  >
                    {DAY_NAMES_SHORT[d]}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
            <div>
              <label className="form-label">Desde</label>
              <select className="form-select" value={startTime} onChange={(e) => setStartTime(e.target.value)}>
                {slots.map((s) => <option key={s.start} value={s.start}>{s.start}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Hasta</label>
              <select className="form-select" value={endMinutes ?? ''} onChange={(e) => setEndMinutes(Number(e.target.value))}>
                {endOptions.map((m) => <option key={m} value={m}>{minutesLabel(m)}</option>)}
              </select>
            </div>
          </div>

          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {classesPerDay} {classesPerDay === 1 ? 'clase' : 'clases'} por día · {classesPerDay * days.length} por semana.
            Se reservan todas las semanas.
          </p>

          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowForm(false)} disabled={busy}>Cancelar</button>
            <button type="submit" className="btn btn-lime btn-sm" disabled={busy || !courtId || endMinutes === null}>
              {busy ? 'Reservando...' : 'Reservar horario'}
            </button>
          </div>
        </form>
      ) : (
        <button className="btn btn-lime btn-sm" onClick={() => setShowForm(true)} disabled={courts.length === 0} style={{ justifyContent: 'center', marginTop: 'auto' }}>
          <CalendarPlus size={15} />
          <span>Reservar horario de clases</span>
        </button>
      )}
    </div>
  );
};
