import React from 'react';
import { Link } from 'react-router-dom';

export const Footer: React.FC = () => {
  return (
    <footer style={{
      background: 'var(--bg-card)',
      borderTop: '1px solid var(--border-subtle)',
      padding: '3rem 0 2rem 0',
      marginTop: 'auto'
    }}>
      <div className="container">
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '2.5rem',
          marginBottom: '2.5rem'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem' }}>
              <div className="brand-mark" style={{ width: '32px', height: '32px', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 800 }}>
                T
              </div>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 800, color: '#ffffff' }}>
                TuTurnito
              </span>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', lineHeight: 1.6 }}>
              La plataforma integral para sacar turnos de pádel, gestionar complejos deportivos y administrar clases de profesores.
            </p>
          </div>

          <div>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '1rem', color: '#ffffff' }}>
              Navegación
            </h4>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              <li><Link to="/" style={{ transition: 'color 0.15s' }}>Catálogo de Complejos</Link></li>
              <li><Link to="/my-reservations">Mis Reservas</Link></li>
              <li><Link to="/auth?mode=register">Registrar mi Complejo</Link></li>
              <li><Link to="/auth?mode=register">Unirme como Profesor</Link></li>
            </ul>
          </div>

          <div>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '1rem', color: '#ffffff' }}>
              Para Complejos y Profesores
            </h4>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              <li>Panel de Reservas con grilla en vivo</li>
              <li>Registro y control manual de cobros</li>
              <li>Gestión de alumnos y saldos de clase</li>
              <li>Turnos fijos y torneos</li>
            </ul>
          </div>
        </div>

        <div style={{
          borderTop: '1px solid var(--border-subtle)',
          paddingTop: '1.5rem',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          fontSize: '0.825rem',
          color: 'var(--text-subtle)'
        }}>
          <div>© 2026 TuTurnito. Todos los derechos reservados.</div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <span>Términos y Condiciones</span>
            <span>Privacidad</span>
            <span>Soporte</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
