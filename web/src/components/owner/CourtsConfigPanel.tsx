import React, { useEffect, useState } from 'react';
import { Settings2, Plus, Trash2, Save, ChevronDown } from 'lucide-react';
import { api } from '../../api/client';
import type { CourtInput } from '../../api/client';
import { Banner } from '../Banner';
import { ConflictModal } from '../ConflictModal';
import { buildCourtSlots } from '../../lib/slots';
import type { Court, ScheduleConflict } from '../../types';

interface CourtsConfigPanelProps {
  complexId: string;
  courts: Court[];
  onSaved: () => void;
}

type EditableCourt = CourtInput & { key: string };

// Half-hour steps; closing may also be 24:00 (midnight).
const HALF_HOURS = Array.from({ length: 49 }).map((_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);
const OPEN_OPTIONS = HALF_HOURS.slice(0, 48);
const CLOSE_OPTIONS = HALF_HOURS.slice(1);
const SLOT_OPTIONS = [30, 45, 60, 75, 90, 105, 120, 150, 180];

const toEditable = (c: Court): EditableCourt => ({
  key: c.id,
  id: c.id,
  name: c.name,
  openTime: c.openTime,
  closeTime: c.closeTime,
  slotMinutes: c.slotMinutes,
  basePrice: c.basePrice,
});

/**
 * Courts and their daily range (apertura, cierre, duración del turno, precio
 * base). The range shapes the reservations grid; one-off changes (a blocked
 * turn, a special price) are made on the grid itself.
 */
export const CourtsConfigPanel: React.FC<CourtsConfigPanelProps> = ({ complexId, courts, onSaved }) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<EditableCourt[]>(() => courts.map(toEditable));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [conflictData, setConflictData] = useState<{ conflictType: string; conflicts: ScheduleConflict[] } | null>(null);

  useEffect(() => {
    setDraft(courts.map(toEditable));
  }, [courts]);

  const update = (key: string, patch: Partial<EditableCourt>) =>
    setDraft((d) => d.map((c) => (c.key === key ? { ...c, ...patch } : c)));

  const handleAdd = () => {
    const last = draft[draft.length - 1];
    setDraft([
      ...draft,
      {
        key: `new-${Date.now()}`,
        name: `Cancha ${draft.length + 1}`,
        openTime: last?.openTime || '08:00',
        closeTime: last?.closeTime || '23:00',
        slotMinutes: last?.slotMinutes || 90,
        basePrice: last?.basePrice ?? 12000,
      },
    ]);
  };

  const handleRemove = (key: string) => {
    if (draft.length <= 1) {
      setMessage({ type: 'error', text: 'Debes mantener al menos una cancha.' });
      return;
    }
    setDraft(draft.filter((c) => c.key !== key));
  };

  const handleSave = async (resolveConflicts?: 'KEEP' | 'CANCEL') => {
    const invalid = draft.find((c) => !c.name.trim() || buildCourtSlots(c).length === 0);
    if (invalid) {
      setMessage({ type: 'error', text: `Revisá "${invalid.name || 'cancha sin nombre'}": necesita nombre y un rango que alcance para al menos un turno.` });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      await api.schedules.saveCourts(complexId, {
        courts: draft.map(({ key: _key, ...c }, i) => ({ ...c, name: c.name.trim(), order: i, basePrice: Number(c.basePrice) })),
        ...(resolveConflicts ? { resolveConflicts } : {}),
      });
      setConflictData(null);
      setMessage({ type: 'success', text: 'Canchas guardadas. La grilla ya refleja los nuevos horarios.' });
      onSaved();
    } catch (err: any) {
      if (err.status === 409 && err.data?.hasConflicts) {
        setConflictData(err.data);
      } else {
        setMessage({ type: 'error', text: err.message || 'Error al guardar las canchas.' });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      {conflictData && (
        <ConflictModal
          conflicts={conflictData.conflicts}
          conflictType={conflictData.conflictType}
          loading={saving}
          onResolve={(decision) => handleSave(decision)}
          onClose={() => setConflictData(null)}
        />
      )}

      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', textAlign: 'left' }}
      >
        <div>
          <h3 className="panel-section-title"><Settings2 size={18} color="var(--accent-cyan)" /> Canchas y horarios</h3>
          <p className="panel-section-sub">Rango horario, duración del turno y precio base de cada cancha. Define las columnas de la grilla.</p>
        </div>
        <ChevronDown size={20} color="var(--text-muted)" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform var(--transition-fast)', flexShrink: 0 }} />
      </button>

      {open && (
        <div style={{ marginTop: '1.25rem' }}>
          {message && <Banner type={message.type} text={message.text} marginBottom="1rem" />}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {draft.map((court) => {
              const slotCount = buildCourtSlots(court).length;
              return (
                <div
                  key={court.key}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(125px, 1fr))',
                    gap: '0.6rem',
                    alignItems: 'end',
                    background: 'var(--bg-surface)',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.85rem',
                  }}
                >
                  <div>
                    <label className="form-label">Cancha</label>
                    <input className="form-input" value={court.name} onChange={(e) => update(court.key, { name: e.target.value })} />
                  </div>
                  <div>
                    <label className="form-label">Apertura</label>
                    <select className="form-select" value={court.openTime} onChange={(e) => update(court.key, { openTime: e.target.value })}>
                      {OPEN_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Cierre</label>
                    <select className="form-select" value={court.closeTime} onChange={(e) => update(court.key, { closeTime: e.target.value })}>
                      {CLOSE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Turno</label>
                    <select className="form-select" value={court.slotMinutes} onChange={(e) => update(court.key, { slotMinutes: Number(e.target.value) })}>
                      {SLOT_OPTIONS.map((m) => <option key={m} value={m}>{m} min</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Precio base</label>
                    <input
                      type="number"
                      min="0"
                      step="500"
                      className="form-input"
                      value={court.basePrice}
                      onChange={(e) => update(court.key, { basePrice: Number(e.target.value) })}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingBottom: '0.35rem' }}>
                    <span style={{ fontSize: '0.75rem', color: slotCount ? 'var(--text-muted)' : 'var(--status-blocked)', whiteSpace: 'nowrap' }}>
                      {slotCount} turnos/día
                    </span>
                    <button onClick={() => handleRemove(court.key)} title="Eliminar cancha" aria-label={`Eliminar ${court.name}`} style={{ color: 'var(--status-blocked)', padding: '0.4rem' }}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem' }}>
            <button className="btn btn-secondary btn-sm" onClick={handleAdd}>
              <Plus size={15} />
              <span>Agregar cancha</span>
            </button>
            <button className="btn btn-lime btn-sm" disabled={saving} onClick={() => handleSave()}>
              <Save size={15} />
              <span>{saving ? 'Guardando...' : 'Guardar canchas'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
