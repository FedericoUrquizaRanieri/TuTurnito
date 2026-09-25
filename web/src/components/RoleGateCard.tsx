import React from 'react';
import { Link } from 'react-router-dom';

interface RoleGateCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  cta: React.ReactNode;
  ctaHref: string;
  ctaVariant?: 'primary' | 'lime';
}

/**
 * Centered "you can't be here" card — used for both role gates (Owner/
 * Professor dashboards requiring login, MyReservationsPage) and the
 * complex-not-found state on ComplexDetailPage, which share the exact same
 * layout.
 */
export const RoleGateCard: React.FC<RoleGateCardProps> = ({ icon, title, description, cta, ctaHref, ctaVariant = 'primary' }) => (
  <div className="container" style={{ padding: '6rem 1.5rem', textAlign: 'center' }}>
    <div
      style={{
        maxWidth: '500px',
        margin: '0 auto',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        padding: '3rem 2rem',
      }}
    >
      <div style={{ marginBottom: '1rem' }}>{icon}</div>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.5rem' }}>{title}</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.925rem', marginBottom: '1.5rem' }}>{description}</p>
      <Link to={ctaHref} className={`btn btn-${ctaVariant}`}>
        {cta}
      </Link>
    </div>
  </div>
);
