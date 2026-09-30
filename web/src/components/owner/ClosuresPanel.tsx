import React, { useCallback, useEffect, useState } from 'react';
import { CalendarOff, Plus, Trash2, AlertTriangle, Repeat, GraduationCap } from 'lucide-react';
import { api, ApiError } from '../../api/client';
import { Banner } from '../Banner';
import { EmptyState } from '../EmptyState';
import { useToast } from '../../context/ToastContext';
import { addDays, shortDateLabel, todayStr } from '../../lib/dates';
import type { Closure, ClosureConflict } from '../../types';

interface ClosuresPanelProps {
  complexId: string;
  /** Called after a closure is created or deleted, so the grid reloads. */
  onChanged: () => void;
}

const emptyForm = () => ({ startDate: addDays(todayStr(), 1), endDate: addDays(todayStr(), 1), reason: 'Feriado' });

function rangeLabel(c: { startDate: string; endDate: string }) {
  return c.startDate === c.endDate ? shortDateLabel(c.startDate) : `${shortDateLabel(c.startDate)} al ${shortDateLabel(c.endDate)}`;
}

/** Feriados y cierres: blocks every court for a date range; fixed bookings and classes skip those days. */
export const ClosuresPanel: React.FC<ClosuresPanelProps> = ({ complexId, onChanged }) => {
  const toast = useToast();
  const [closures, setClosures] = useState<Closure[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ClosureConflict[] | null>(null);

  const load = useCallback(async () => {
    try {
      setClosures((await api.closures.list(complexId)).closures);
    } catch (err) {
      toast.error(err, 'No se pudieron cargar los cierres.');
    }
  }, [complexId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (cancelConflicts: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.closures.create(complexId, { ...form, cancelConflicts });
      toast.success(
        res.cancelled > 0
          ? `Cierre creado. Se cancelaron ${res.cancelled} reserva${res.cancelled === 1 ? '' : 's'}.`
          : 'Cierre creado. Esos días quedan bloqueados.'
      );
      setConflicts(null);
      setShowForm(false);
      setForm(emptyForm());
      await load();
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.data?.conflicts) {
        setConflicts(err.data.conflicts);
      } else {
        setError(err instanceof Error ? err.message : 'No se pudo crear el cierre.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (c: Closure) => {
    if (!confirm(`¿Eliminar el cierre "${c.reason}" (${rangeLabel(c)})? Los turnos vuelven a quedar disponibles.`)) return;
    setBusy(true);
    try {
      await api.closures.remove(complexId, c.id);
      toast.success('Cierre eliminado.');
      await load();
      onChanged();
    } catch (err) {
      toast.error(err, 'No se pudo eliminar el cierre.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
        <div>
          <h3 className="panel-section-title"><CalendarOff size={18} color="var(--status-blocked)" /> Feriados y cierres</h3>
          <p className="panel-section-sub">Bloqueá todas las canchas por uno o varios días. Los turnos fijos y las clases no se reservan esos días.</p>
        </div>
        {!showForm && (
          <button className="btn btn-secondary btn-sm" onClick={() => setShowForm(true)}>
            <Plus size={15} />
            <span>Nuevo cierre</span>
          </button>
        )}
      </div>

      {showForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(false);
          }}
          style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', padding: '1rem', marginBottom: '1.25rem' }}
        >
          {error && <Banner type="error" text={error} marginBottom="1rem" />}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Desde</label>
              <input
                type="date"
                className="form-input"
                required
                min={todayStr()}
                value={form.startDate}
                onChange={(e) => {
                  setConflicts(null);
                  const startDate = e.target.value;
                  setForm((f) => ({ ...f, startDate, endDate: f.endDate < startDate ? startDate : f.endDate }));
                }}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Hasta</label>
              <input
                type="date"
                className="form-input"
                required
                min={form.startDate}
                value={form.endDate}
                onChange={(e) => {
                  setConflicts(null);
                  setForm({ ...form, endDate: e.target.value });
                }}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Motivo</label>
              <input
                className="form-input"
                required
                minLength={2}
                maxLength={60}
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                placeholder="Feriado, mantenimiento..."
              />
            </div>
          </div>

          {conflicts && (
            <div style={{ marginTop: '1rem', border: '1px solid rgba(239, 93, 99, 0.3)', borderRadius: 'var(--radius-md)', padding: '0.85rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                <AlertTriangle size={16} color="var(--status-blocked)" />
                Hay {conflicts.length} reserva{conflicts.length === 1 ? '' : 's'} en esos días
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: '180px', overflowY: 'auto', fontSize: '0.825rem' }}>
                {conflicts.map((c) => (
                  <div key={c.reservationId} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <strong>{shortDateLabel(c.date)} {c.time}</strong>
                    <span style={{ color: 'var(--text-muted)' }}>{c.courtName}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                      {c.type === 'CLASS' ? <GraduationCap size={12} /> : c.isRecurring ? <Repeat size={12} /> : null}
                      {c.guestName}
                    </span>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.6rem 0 0' }}>
                Si confirmás, se cancelan. Los turnos fijos y las clases se retoman solos la semana siguiente. Avisales a los clientes.
              </p>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setShowForm(false);
                setConflicts(null);
                setError(null);
              }}
              disabled={busy}
            >
              Cancelar
            </button>
            {conflicts ? (
              <button type="button" className="btn btn-danger btn-sm" onClick={() => submit(true)} disabled={busy}>
                <span>{busy ? 'Cerrando...' : 'Cancelar reservas y cerrar'}</span>
              </button>
            ) : (
              <button type="submit" className="btn btn-lime btn-sm" disabled={busy}>
                <Plus size={14} />
                <span>{busy ? 'Creando...' : 'Crear cierre'}</span>
              </button>
            )}
          </div>
        </form>
      )}

      {closures.length === 0 ? (
        <EmptyState message="No hay cierres programados." padding="1.5rem" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {closures.map((c) => (
            <div
              key={c.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
                flexWrap: 'wrap',
                background: 'var(--bg-surface)',
                borderLeft: '3px solid var(--status-blocked)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.7rem 0.9rem',
              }}
            >
              <div>
                <div style={{ fontWeight: 800 }}>{c.reason}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{rangeLabel(c)} · todas las canchas</div>
              </div>
              <button className="btn btn-danger btn-sm" onClick={() => handleDelete(c)} disabled={busy} style={{ padding: '0.3rem 0.6rem' }}>
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
