import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Calendar,
  User as UserIcon,
  LogOut,
  LayoutDashboard,
  GraduationCap,
  Sparkles,
  Menu,
  X,
  ShieldCheck,
  ChevronDown,
  Users,
} from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, logout, loginDemo } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [demoDropdown, setDemoDropdown] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const handleQuickDemo = async (role: 'DUEÑO' | 'PROFESOR' | 'JUGADOR') => {
    await loginDemo(role);
    setDemoDropdown(false);
    if (role === 'DUEÑO') navigate('/owner');
    else if (role === 'PROFESOR') navigate('/professor');
    else navigate('/my-reservations');
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <header style={{
      position: 'sticky',
      top: 0,
      zIndex: 50,
      background: 'rgba(12, 26, 44, 0.88)',
      backdropFilter: 'blur(16px)',
      borderBottom: '1px solid var(--border-subtle)'
    }}>
      <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '72px' }}>
        {/* Brand Logo */}
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', textDecoration: 'none' }}>
          <div className="brand-mark" style={{ width: '38px', height: '38px', borderRadius: '9px', fontSize: '1.15rem', fontWeight: 800 }}>
            T
          </div>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.01em', color: '#ffffff' }}>
            TuTurnito
          </span>
        </Link>

        {/* Desktop Navigation Links */}
        <nav style={{ display: 'none', alignItems: 'center', gap: '2rem' }} className="desktop-nav">
          <Link to="/" className={`nav-link ${isActive('/') ? 'active' : ''}`}>
            Complejos
          </Link>

          <Link to="/partidos" className={`nav-link ${isActive('/partidos') ? 'active' : ''}`}>
            <Users size={16} />
            Partidos abiertos
          </Link>

          {user && (
            <Link to="/my-reservations" className={`nav-link ${isActive('/my-reservations') ? 'active' : ''}`}>
              <Calendar size={16} />
              Mis reservas
            </Link>
          )}

          {user?.role === 'DUEÑO' && (
            <Link to="/owner" className={`nav-link ${isActive('/owner') ? 'active' : ''}`}>
              <LayoutDashboard size={16} />
              Panel de dueño
            </Link>
          )}

          {user?.role === 'PROFESOR' && (
            <Link to="/professor" className={`nav-link ${isActive('/professor') ? 'active' : ''}`}>
              <GraduationCap size={16} />
              Panel de profesor
            </Link>
          )}
        </nav>

        {/* Right Section: Demo Quick Switcher & User Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div className="desktop-nav" style={{ alignItems: 'center', gap: '0.75rem' }}>
          {/* Quick Demo Selector */}
          <div style={{ position: 'relative' }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setDemoDropdown(!demoDropdown)}
              style={{
                background: 'rgba(242, 165, 61, 0.1)',
                borderColor: 'rgba(242, 165, 61, 0.3)',
                color: 'var(--accent-secondary)'
              }}
            >
              <Sparkles size={14} />
              <span>Probar la demo</span>
              <ChevronDown size={14} />
            </button>

            {demoDropdown && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '0.5rem',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.5rem',
                  width: '220px',
                  boxShadow: 'var(--shadow-lg)',
                  zIndex: 60,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.25rem'
                }}
              >
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-subtle)', padding: '0.25rem 0.5rem' }}>
                  Entrar como
                </div>
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ justifyContent: 'flex-start', textAlign: 'left' }}
                  onClick={() => handleQuickDemo('DUEÑO')}
                >
                  <ShieldCheck size={14} color="var(--accent-cyan)" />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>Carlos Dueño</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Panel de reservas y cobros</div>
                  </div>
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ justifyContent: 'flex-start', textAlign: 'left' }}
                  onClick={() => handleQuickDemo('PROFESOR')}
                >
                  <GraduationCap size={14} color="var(--accent-secondary)" />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>Martín Profesor</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Clases y alumnos</div>
                  </div>
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ justifyContent: 'flex-start', textAlign: 'left' }}
                  onClick={() => handleQuickDemo('JUGADOR')}
                >
                  <UserIcon size={14} color="var(--accent-primary)" />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>Federico Jugador</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Reservas de turnos</div>
                  </div>
                </button>
              </div>
            )}
          </div>

          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Link
                to="/profile"
                className="btn btn-secondary btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                <div style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  background: 'var(--accent-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: 'white'
                }}>
                  {user.name.charAt(0)}
                </div>
                <span style={{ maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name}</span>
                <span className="badge badge-role" style={{ fontSize: '0.65rem' }}>
                  {user.role}
                </span>
              </Link>

              <button
                className="btn btn-secondary btn-sm"
                onClick={handleLogout}
                title="Cerrar sesión"
                style={{ padding: '0.5rem' }}
              >
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Link to="/auth?mode=login" className="btn btn-secondary btn-sm">
                Ingresar
              </Link>
              <Link to="/auth?mode=register" className="btn btn-primary btn-sm">
                Registrarse
              </Link>
            </div>
          )}
          </div>

          {/* Mobile Menu Toggle */}
          <button
            className="btn btn-secondary btn-sm mobile-toggle"
            onClick={() => setMobileOpen(!mobileOpen)}
            style={{ display: 'none' }}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div style={{
          background: 'var(--bg-card)',
          borderTop: '1px solid var(--border-subtle)',
          padding: '1rem 1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem'
        }}>
          <Link
            to="/"
            onClick={() => setMobileOpen(false)}
            style={{ padding: '0.5rem 0', fontWeight: 600, color: 'var(--text-main)' }}
          >
            Complejos
          </Link>
          <Link
            to="/partidos"
            onClick={() => setMobileOpen(false)}
            style={{ padding: '0.5rem 0', fontWeight: 600, color: 'var(--text-main)' }}
          >
            Partidos abiertos
          </Link>
          {user && (
            <Link
              to="/my-reservations"
              onClick={() => setMobileOpen(false)}
              style={{ padding: '0.5rem 0', fontWeight: 600, color: 'var(--text-main)' }}
            >
              Mis reservas
            </Link>
          )}
          {user?.role === 'DUEÑO' && (
            <Link
              to="/owner"
              onClick={() => setMobileOpen(false)}
              style={{ padding: '0.5rem 0', fontWeight: 600, color: 'var(--text-main)' }}
            >
              Panel de dueño
            </Link>
          )}
          {user?.role === 'PROFESOR' && (
            <Link
              to="/professor"
              onClick={() => setMobileOpen(false)}
              style={{ padding: '0.5rem 0', fontWeight: 600, color: 'var(--text-main)' }}
            >
              Panel de profesor
            </Link>
          )}

          <div className="hairline" />

          {user ? (
            <button
              onClick={() => { setMobileOpen(false); handleLogout(); }}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0', fontWeight: 600, color: 'var(--text-main)' }}
            >
              <LogOut size={16} />
              Cerrar sesión
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <Link to="/auth?mode=login" onClick={() => setMobileOpen(false)} className="btn btn-secondary btn-sm" style={{ flex: 1 }}>
                Ingresar
              </Link>
              <Link to="/auth?mode=register" onClick={() => setMobileOpen(false)} className="btn btn-primary btn-sm" style={{ flex: 1 }}>
                Registrarse
              </Link>
            </div>
          )}
        </div>
      )}
    </header>
  );
};
