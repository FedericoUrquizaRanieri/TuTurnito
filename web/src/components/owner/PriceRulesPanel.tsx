import React, { useCallback, useEffect, useState } from 'react';
import { Tags, Plus, Trash2, Save } from 'lucide-react';
import { api } from '../../api/client';
import { Banner } from '../Banner';
import { EmptyState } from '../EmptyState';
import { useToast } from '../../context/ToastContext';
import { DAY_NAMES_SHORT } from '../../lib/dates';
import type { Court, PriceRule } from '../../types';

interface PriceRulesPanelProps {
  complexId: string;
  courts: Court[];
  /** Called after saving, so the grid reloads with the new prices. */
  onSaved: () => void;
}

// Monday first, like the rest of the app's week views.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

type DraftRule = Omit<PriceRule, 'id' | 'court'> & { key: string };

let keySeq = 0;
const newKey = () => `rule-${++keySeq}`;

const toDraft = (r: PriceRule): DraftRule => ({
  key: newKey(),
  courtId: r.courtId,
  daysOfWeek: r.daysOfWeek,
  startTime: r.startTime,
  endTime: r.endTime,
  price: r.price,
  label: r.label ?? '',
});

function daysLabel(days: number[]) {
  const sorted = WEEK_ORDER.filter((d) => days.includes(d));
  if (sorted.length === 7) return 'Todos los días';
  if (sorted.join() === '1,2,3,4,5') return 'Lun a Vie';
  if (sorted.join() === '6,0') return 'Sáb y Dom';
  return sorted.map((d) => DAY_NAMES_SHORT[d]).join(', ');
}

/**
 * Precios por franja: peak hours, promos for quiet hours, weekend prices.
 * Each rule changes the price of the turns that start inside its time range
 * on its weekdays; turns outside every rule keep the court's base price.
 */
export const PriceRulesPanel: React.FC<PriceRulesPanelProps> = ({ complexId, courts, onSaved }) => {
  const toast = useToast();
  const [draft, setDraft] = useState<DraftRule[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { rules } = await api.priceRules.list(complexId);
      setDraft(rules.map(toDraft));
      setDirty(false);
    } catch (err) {
      toast.error(err, 'No se pudieron cargar los precios por franja.');
    }
  }, [complexId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const update = (key: string, patch: Partial<DraftRule>) => {
    setDraft((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setDirty(true);
    setError(null);
  };

  const toggleDay = (rule: DraftRule, day: number) =>
    update(rule.key, {
      daysOfWeek: rule.daysOfWeek.includes(day) ? rule.daysOfWeek.filter((d) => d !== day) : [...rule.daysOfWeek, day],
    });

  const addRule = () => {
    const base = courts[0]?.basePrice ?? 12000;
    setDraft((rows) => [
      ...rows,
      { key: newKey(), courtId: null, daysOfWeek: [1, 2, 3, 4, 5], startTime: '18:00', endTime: '23:00', price: Math.round(base * 1.2), label: 'Hora pico' },
    ]);
    setDirty(true);
  };

  const removeRule = (key: string) => {
    setDraft((rows) => rows.filter((r) => r.key !== key));
    setDirty(true);
    setError(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const { rules } = await api.priceRules.save(
        complexId,
        draft.map(({ key: _key, ...r }) => ({ ...r, price: Number(r.price), label: r.label?.trim() || null }))
      );
      setDraft(rules.map(toDraft));
      setDirty(false);
      toast.success('Precios guardados. Los turnos libres ya tienen el precio nuevo.');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron guardar los precios.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
        <div>
          <h3 className="panel-section-title"><Tags size={18} color="var(--accent-secondary)" /> Precios por franja</h3>
          <p className="panel-section-sub">
            Cobrá distinto en hora pico o poné promos en horarios flojos. Fuera de las franjas se usa el precio base de cada cancha.
            Las reservas ya hechas mantienen su precio.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary btn-sm" onClick={addRule} disabled={courts.length === 0}>
            <Plus size={15} />
            <span>Agregar franja</span>
          </button>
          {dirty && (
            <button className="btn btn-lime btn-sm" onClick={handleSave} disabled={saving}>
              <Save size={14} />
              <span>{saving ? 'Guardando...' : 'Guardar precios'}</span>
            </button>
          )}
        </div>
      </div>

      {error && <Banner type="error" text={error} marginBottom="1rem" />}

      {draft.length === 0 ? (
        <EmptyState message="Todos los turnos usan el precio base de su cancha." padding="1.5rem" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {draft.map((rule) => (
            <div
              key={rule.key}
              style={{
                background: 'var(--bg-surface)',
                borderLeft: '3px solid var(--accent-secondary)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.85rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.7rem',
              }}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
                {WEEK_ORDER.map((d) => {
                  const on = rule.daysOfWeek.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleDay(rule, d)}
                      aria-pressed={on}
                      className={`btn btn-sm ${on ? 'btn-lime' : 'btn-secondary'}`}
                      style={{ padding: '0.25rem 0.55rem', minWidth: '44px', justifyContent: 'center' }}
                    >
                      {DAY_NAMES_SHORT[d]}
                    </button>
                  );
                })}
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.35rem' }}>{daysLabel(rule.daysOfWeek) || 'Elegí los días'}</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.6rem', alignItems: 'end' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Cancha</label>
                  <select
                    className="form-select"
                    value={rule.courtId ?? ''}
                    onChange={(e) => update(rule.key, { courtId: e.target.value || null })}
                  >
                    <option value="">Todas</option>
                    {courts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Desde</label>
                  <input type="time" className="form-input" value={rule.startTime} onChange={(e) => update(rule.key, { startTime: e.target.value })} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Hasta</label>
                  <input type="time" className="form-input" value={rule.endTime} onChange={(e) => update(rule.key, { endTime: e.target.value })} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Precio ($)</label>
                  <input
                    type="number"
                    className="form-input"
                    min={0}
                    step="any"
                    value={rule.price}
                    onChange={(e) => update(rule.key, { price: Number(e.target.value) })}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Etiqueta</label>
                  <input
                    className="form-input"
                    maxLength={40}
                    value={rule.label ?? ''}
                    placeholder="Opcional"
                    onChange={(e) => update(rule.key, { label: e.target.value })}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => removeRule(rule.key)}
                  title="Quitar franja"
                  style={{ padding: '0.45rem 0.6rem', justifySelf: 'start' }}
                >
                  <Trash2 size={13} />
                  <span>Quitar</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
