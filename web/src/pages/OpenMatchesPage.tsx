import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, Search } from 'lucide-react';
import { api } from '../api/client';
import { useToast } from '../context/ToastContext';
import { OpenMatchCard } from '../components/openMatch/OpenMatchCard';
import { useJoinOpenMatch } from '../components/openMatch/useJoinOpenMatch';
import { MATCH_CATEGORIES } from '../components/openMatch/OpenMatchFields';
import { EmptyState } from '../components/EmptyState';
import { todayStr } from '../lib/dates';
import type { OpenMatchSummary } from '../types';

/** /partidos — every open match ("faltan N") with room left, filterable by city, date and level. */
export const OpenMatchesPage: React.FC = () => {
  const toast = useToast();
  const [matches, setMatches] = useState<OpenMatchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ location: '', date: '', category: '' });

  const load = useCallback(async () => {
    try {
      const res = await api.openMatches.list(filters);
      setMatches(res.matches);
    } catch (err) {
      toast.error(err, 'No se pudieron cargar los partidos abiertos.');
    } finally {
      setLoading(false);
    }
  }, [filters, toast]);

  useEffect(() => {
    const t = setTimeout(load, 250); // debounce typing in the city filter
    return () => clearTimeout(t);
  }, [load]);

  const { join, busyId } = useJoinOpenMatch(load);

  return (
    <div className="main-content container" style={{ paddingTop: '3rem', paddingBottom: '4rem' }}>
      <div style={{ marginBottom: '1.75rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Users size={28} color="var(--accent-secondary)" />
          <span>Partidos abiertos</span>
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', maxWidth: '640px' }}>
          Turnos ya reservados a los que les faltan jugadores. Sumate con un click y coordiná con el organizador desde Mis reservas.
          ¿Te falta gente a vos? Reservá un turno y marcá “Me faltan jugadores”.
        </p>
      </div>

      <div className="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', padding: '1rem', marginBottom: '1.5rem' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Ciudad o zona</label>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '0.7rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)' }} />
            <input
              className="form-input"
              style={{ paddingLeft: '2rem' }}
              placeholder="Bahía Blanca"
              value={filters.location}
              onChange={(e) => setFilters({ ...filters, location: e.target.value })}
            />
          </div>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Día</label>
          <input
            type="date"
            className="form-input"
            min={todayStr()}
            value={filters.date}
            onChange={(e) => setFilters({ ...filters, date: e.target.value })}
          />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Nivel</label>
          <select className="form-select" value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}>
            <option value="">Todos</option>
            {MATCH_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>Buscando partidos...</div>
      ) : matches.length === 0 ? (
        <div>
          <EmptyState message="No hay partidos abiertos con esos filtros por ahora." />
          <div style={{ textAlign: 'center', marginTop: '1rem' }}>
            <Link to="/" className="btn btn-secondary btn-sm">Reservar un turno y publicar el mío</Link>
          </div>
        </div>
      ) : (
        <div className="open-match-grid">
          {matches.map((m) => (
            <OpenMatchCard key={m.id} match={m} busy={busyId === m.id} onJoin={join} />
          ))}
        </div>
      )}
    </div>
  );
};
