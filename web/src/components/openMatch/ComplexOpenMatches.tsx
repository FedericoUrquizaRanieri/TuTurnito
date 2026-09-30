import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users } from 'lucide-react';
import { api } from '../../api/client';
import { OpenMatchCard } from './OpenMatchCard';
import { useJoinOpenMatch } from './useJoinOpenMatch';
import type { OpenMatchSummary } from '../../types';

interface ComplexOpenMatchesProps {
  complexId: string;
  /** Changes whenever the turns reload (e.g. after booking with "me faltan jugadores"). */
  refreshKey?: unknown;
}

/** "Partidos abiertos" section of a complex's public page; hidden when there are none. */
export const ComplexOpenMatches: React.FC<ComplexOpenMatchesProps> = ({ complexId, refreshKey }) => {
  const [matches, setMatches] = useState<OpenMatchSummary[]>([]);

  const load = useCallback(async () => {
    try {
      setMatches((await api.openMatches.list({ complexId })).matches);
    } catch {
      // Secondary section: the page still works without it.
      setMatches([]);
    }
  }, [complexId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const { join, busyId } = useJoinOpenMatch(load);

  if (matches.length === 0) return null;

  return (
    <section className="container" style={{ paddingTop: '2.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Users size={22} color="var(--accent-secondary)" />
            <span>Partidos abiertos</span>
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Turnos reservados que buscan jugadores. Sumate directo.</p>
        </div>
        <Link to="/partidos" className="btn btn-secondary btn-sm">Ver todos</Link>
      </div>
      <div className="open-match-grid">
        {matches.map((m) => (
          <OpenMatchCard key={m.id} match={m} showComplex={false} busy={busyId === m.id} onJoin={join} />
        ))}
      </div>
    </section>
  );
};
