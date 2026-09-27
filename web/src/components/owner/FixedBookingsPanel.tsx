import React, { useEffect, useMemo, useState } from 'react';
import { Repeat, Plus, Trash2, Phone } from 'lucide-react';
import { api } from '../../api/client';
import { Banner } from '../Banner';
import { EmptyState } from '../EmptyState';
import { DAY_NAMES, shortDateLabel, todayStr } from '../../lib/dates';
import { buildCourtSlots } from '../../lib/slots';
import type { Court, FixedBooking } from '../../types';

interface FixedBookingsPanelProps {
  complexId: string;
  courts: Court[];
  fixedBookings: FixedBooking[];
  onChanged: () => void;
}

// Monday first, like the rest of the app's week views.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

const emptyForm = { courtId: '', dayOfWeek: 1, startTime: '', guestName: '', guestPhone: '', notes: '' };

/** Sub-panel for turnos fijos: same court, weekday and time every week, booked automatically as real reservations. */
export const FixedBookingsPanel: React.FC<FixedBookingsPanelProps> = ({ complexId, courts, fixedBookings, onChanged }) => {
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const selectedCourt = courts.find((c) => c.id === form.courtId);
  const slots = useMemo(() => (selectedCourt ? buildCourtSlots(selectedCourt) : []), [selectedCourt]);

  // Default the court to the first one, and the time to the court's first slot.
  useEffect(() => {
    if (!form.courtId && courts.length > 0) setForm((f) => ({ ...f, courtId: courts[0].id }));
  }, [courts, form.courtId]);
  useEffect(() => {
    if (slots.length > 0 && !slots.some((s) => s.start === form.startTime)) {
      setForm((f) => ({ ...f, startTime: slots[0].start }));
    }
  }, [slots, form.startTime]);

  const sorted = [...fixedBookings].sort(
    (a, b) => WEEK_ORDER.indexOf(a.dayOfWeek) - WEEK_ORDER.indexOf(b.dayOfWeek) || a.startTime.localeCompare(b.startTime)
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await api.fixedBookings.create(complexId, {
        courtId: form.courtId,
        dayOfWeek: Number(form.dayOfWeek),
        startTime: form.startTime,
        guestName: form.guestName,
        guestPhone: form.guestPhone,
        notes: form.notes || undefined,
      });
      const skipped = res.skippedDates.length
        ? ` No se pudo reservar: ${res.skippedDates.map(shortDateLabel).join(', ')} (turno ya ocupado o bloqueado).`
        : '';
      setMessage({ type: skipped ? 'error' : 'success', text: `Turno fijo creado para ${res.fixedBooking.guestName}.${skipped}` });
      setForm({ ...emptyForm, courtId: form.courtId });
      setShowForm(false);
      onChanged();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error al crear el turno fijo.' });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (fb: FixedBooking) => {
    if (!confirm(`¿Eliminar el turno fijo de ${fb.guestName}?`)) return;
    const cancelFuture = confirm(
      '¿Cancelar también sus próximas reservas ya generadas?\n\nAceptar: se liberan los turnos futuros.\nCancelar: esas reservas se mantienen como reservas comunes.'
    );
    setBusy(true);
    setMessage(null);
    try {
      await api.fixedBookings.remove(complexId, fb.id, cancelFuture);
      setMessage({ type: 'success', text: 'Turno fijo eliminado.' });
      onChanged();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error al eliminar el turno fijo.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
        <div>
          <h3 className="panel-section-title"><Repeat size={18} color="var(--accent-secondary)" /> Turnos fijos</h3>
          <p className="panel-section-sub">Clientes que juegan el mismo día y horario todas las semanas. Se reservan solos y aparecen en la grilla.</p>
        </div>
        {!showForm && (
          <button className="btn btn-lime btn-sm" onClick={() => setShowForm(true)} disabled={courts.length === 0}>
            <Plus size={15} />
            <span>Nuevo turno fijo</span>
          </button>
        )}
      </div>

      {message && <Banner type={message.type} text={message.text} marginBottom="1rem" />}

      {showForm && (
        <form onSubmit={handleCreate} style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', padding: '1rem', marginBottom: '1.25rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Cancha</label>
              <select className="form-select" value={form.courtId} onChange={(e) => setForm({ ...form, courtId: e.target.value })}>
                {courts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Día</label>
              <select className="form-select" value={form.dayOfWeek} onChange={(e) => setForm({ ...form, dayOfWeek: Number(e.target.value) })}>
                {WEEK_ORDER.map((d) => <option key={d} value={d}>{DAY_NAMES[d]}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Horario</label>
              <select className="form-select" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })}>
                {slots.map((s) => <option key={s.start} value={s.start}>{s.start} a {s.end}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Cliente *</label>
              <input className="form-input" required minLength={2} value={form.guestName} onChange={(e) => setForm({ ...form, guestName: e.target.value })} placeholder="Nombre" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Teléfono *</label>
              <input className="form-input" required minLength={6} value={form.guestPhone} onChange={(e) => setForm({ ...form, guestPhone: e.target.value })} placeholder="291 4567890" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Nota</label>
              <input className="form-input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Opcional" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowForm(false)} disabled={busy}>Cancelar</button>
            <button type="submit" className="btn btn-lime btn-sm" disabled={busy || !form.startTime}>
              <Plus size={14} />
              <span>{busy ? 'Creando...' : 'Crear turno fijo'}</span>
            </button>
          </div>
        </form>
      )}

      {sorted.length === 0 ? (
        <EmptyState message="Todavía no hay turnos fijos." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {sorted.map((fb) => (
            <div
              key={fb.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
                flexWrap: 'wrap',
                background: 'var(--bg-surface)',
                borderLeft: '3px solid var(--accent-secondary)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.7rem 0.9rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <div style={{ minWidth: '130px' }}>
                  <div style={{ fontWeight: 800 }}>{DAY_NAMES[fb.dayOfWeek]} {fb.startTime}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{fb.court?.name}</div>
                </div>
                <div>
                  <div style={{ fontWeight: 600 }}>{fb.guestName}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <Phone size={11} /> {fb.guestPhone}
                    {fb.startDate > todayStr() && <span> · desde {shortDateLabel(fb.startDate)}</span>}
                    {fb.endDate && <span> · hasta {shortDateLabel(fb.endDate)}</span>}
                  </div>
                </div>
              </div>
              <button className="btn btn-danger btn-sm" onClick={() => handleDelete(fb)} disabled={busy} title="Eliminar turno fijo" style={{ padding: '0.3rem 0.6rem' }}>
                <Trash2 size={13} />
                <span>Eliminar</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
