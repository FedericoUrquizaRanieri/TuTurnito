import React from 'react';
import type { OpenMatchInput } from '../../types';

// Same list the server accepts (openMatch.service.ts MATCH_CATEGORIES).
export const MATCH_CATEGORIES = ['Principiante', 'Intermedio', 'Avanzado', '1ra', '2da', '3ra', '4ta', '5ta', '6ta', '7ma', '8va'];

interface OpenMatchFieldsProps {
  value: OpenMatchInput;
  onChange: (value: OpenMatchInput) => void;
  /** Players already in: the missing count can't go below it. */
  minSpots?: number;
}

/** "Me faltan jugadores": how many are missing (1–3), the level and a short note. */
export const OpenMatchFields: React.FC<OpenMatchFieldsProps> = ({ value, onChange, minSpots = 1 }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
    <div>
      <div className="form-label" style={{ marginBottom: '0.4rem' }}>¿Cuántos jugadores te faltan?</div>
      <div style={{ display: 'flex', gap: '0.4rem' }} role="radiogroup" aria-label="Jugadores que faltan">
        {[1, 2, 3].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value.spots === n}
            disabled={n < minSpots}
            className={`btn btn-sm ${value.spots === n ? 'btn-lime' : 'btn-secondary'}`}
            style={{ minWidth: '52px', justifyContent: 'center' }}
            onClick={() => onChange({ ...value, spots: n })}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem' }}>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label">Nivel / categoría</label>
        <select
          className="form-select"
          value={value.category ?? ''}
          onChange={(e) => onChange({ ...value, category: e.target.value || null })}
        >
          <option value="">Cualquiera</option>
          {MATCH_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label">Nota para los que se suman</label>
        <input
          className="form-input"
          maxLength={140}
          value={value.notes ?? ''}
          placeholder="Ej: buscamos drive"
          onChange={(e) => onChange({ ...value, notes: e.target.value })}
        />
      </div>
    </div>
  </div>
);
