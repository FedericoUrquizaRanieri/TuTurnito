import React from 'react';
import { Link } from 'react-router-dom';
import { Users, MapPin, Clock, CheckCircle2 } from 'lucide-react';
import { shortDateLabel } from '../../lib/dates';
import type { OpenMatchSummary } from '../../types';

interface OpenMatchCardProps {
  match: OpenMatchSummary;
  /** Hide the complex name/link when the card is already inside that complex's page. */
  showComplex?: boolean;
  busy?: boolean;
  onJoin: (match: OpenMatchSummary) => void;
}

/** A public "faltan N" match with a button to join directly. */
export const OpenMatchCard: React.FC<OpenMatchCardProps> = ({ match, showComplex = true, busy = false, onJoin }) => {
  const full = match.spotsLeft === 0;
  return (
    <div className="card open-match-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-main)' }}>
            {shortDateLabel(match.date)} · {match.startTime} hs
          </div>
          {showComplex ? (
            <Link to={`/${match.complex.slug}`} style={{ fontSize: '0.85rem', color: 'var(--accent-secondary)', fontWeight: 700 }}>
              {match.complex.name}
            </Link>
          ) : null}
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{match.courtName}</div>
        </div>
        <span className={`badge ${full ? 'badge-occupied' : 'badge-available'}`} style={{ whiteSpace: 'nowrap' }}>
          <Users size={12} /> {full ? 'Completo' : `Faltan ${match.spotsLeft}`}
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem 0.9rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        {match.category && <span className="badge badge-role">{match.category}</span>}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
          <Clock size={12} /> hasta {match.endTime}
        </span>
        {showComplex && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
            <MapPin size={12} /> {match.complex.location}
          </span>
        )}
        <span>≈ ${match.pricePerPlayer.toLocaleString('es-AR')} c/u</span>
      </div>

      {match.notes && <p style={{ fontSize: '0.85rem', margin: 0 }}>“{match.notes}”</p>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginTop: 'auto' }}>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-subtle)' }}>Organiza {match.organizerName}</span>
        {match.isOrganizer ? (
          <Link to="/my-reservations" className="btn btn-secondary btn-sm">Es tu partido</Link>
        ) : match.joined ? (
          <span className="badge badge-paid" style={{ gap: '0.3rem' }}><CheckCircle2 size={12} /> Ya estás</span>
        ) : (
          <button className="btn btn-lime btn-sm" disabled={busy || full} onClick={() => onJoin(match)}>
            <Users size={14} />
            <span>Sumarme</span>
          </button>
        )}
      </div>
    </div>
  );
};
