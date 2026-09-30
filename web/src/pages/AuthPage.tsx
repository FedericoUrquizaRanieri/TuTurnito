import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, GraduationCap, User as UserIcon, Zap } from 'lucide-react';
import { Banner } from '../components/Banner';

export const AuthPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login, register, loginDemo, user } = useAuth();

  const [mode, setMode] = useState<'login' | 'register'>(
    searchParams.get('mode') === 'register' ? 'register' : 'login'
  );

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'JUGADOR' | 'DUEÑO' | 'PROFESOR'>('JUGADOR');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Back to where the user came from (e.g. joining an open match), only
  // for in-app paths; otherwise each role's home.
  const redirect = searchParams.get('redirect');
  const goAfterAuth = (u: { role: string }) => {
    if (redirect && redirect.startsWith('/') && !redirect.startsWith('//')) navigate(redirect);
    else if (u.role === 'DUEÑO') navigate('/owner');
    else if (u.role === 'PROFESOR') navigate('/professor');
    else navigate('/');
  };

  useEffect(() => {
    if (user) goAfterAuth(user);
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (mode === 'login') {
        const u = await login(email, password);
        goAfterAuth(u);
      } else {
        const u = await register({ name, email, password, phone, role });
        goAfterAuth(u);
      }
    } catch (err: any) {
      setError(err.message || 'Error al procesar la solicitud');
    } finally {
      setLoading(false);
    }
  };

  const handleDemo = async (demoRole: 'DUEÑO' | 'PROFESOR' | 'JUGADOR') => {
    setLoading(true);
    setError(null);
    try {
      const u = await loginDemo(demoRole);
      goAfterAuth(u);
    } catch (err: any) {
      setError(err.message || 'Error con cuenta demo');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="main-content container" style={{ paddingTop: '3.5rem', maxWidth: '480px' }}>
      <div className="card" style={{ padding: '2.5rem 2rem', boxShadow: 'var(--shadow-lg)' }}>
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '14px',
            background: 'linear-gradient(135deg, var(--accent-secondary) 0%, var(--accent-primary) 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#0a0e1a',
            margin: '0 auto 1rem auto',
            boxShadow: '0 0 20px rgba(163, 230, 53, 0.4)'
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/>
              <path d="M2 12h20"/>
            </svg>
          </div>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#ffffff' }}>
            {mode === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta'}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.35rem' }}>
            {mode === 'login'
              ? 'Accede a tus reservas, canchas y clases'
              : 'Elige tu rol y forma parte de la red de pádel'}
          </p>
        </div>

        {/* Mode Switcher Tabs */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          background: 'var(--bg-surface)',
          padding: '0.35rem',
          borderRadius: 'var(--radius-md)',
          marginBottom: '1.5rem',
          gap: '0.25rem',
        }}>
          <button
            type="button"
            className={`btn btn-sm ${mode === 'login' ? 'btn-lime' : ''}`}
            onClick={() => { setMode('login'); setError(null); }}
            style={{
              color: mode === 'login' ? 'var(--text-inverse)' : 'var(--text-muted)',
              fontWeight: 700,
            }}
          >
            Ingresar
          </button>
          <button
            type="button"
            className={`btn btn-sm ${mode === 'register' ? 'btn-lime' : ''}`}
            onClick={() => { setMode('register'); setError(null); }}
            style={{
              color: mode === 'register' ? 'var(--text-inverse)' : 'var(--text-muted)',
              fontWeight: 700,
            }}
          >
            Registrarse
          </button>
        </div>

        {error && <Banner type="error" text={error} />}

        <form onSubmit={handleSubmit}>
          {mode === 'register' && (
            <>
              <div className="form-group">
                <label className="form-label">Nombre Completo *</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  placeholder="Ej: Federico Pérez"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              {/* Role Selector with Rich Cards */}
              <div className="form-group">
                <label className="form-label">¿Cuál es tu rol? *</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => setRole('JUGADOR')}
                    style={{
                      background: role === 'JUGADOR' ? 'rgba(16, 185, 129, 0.2)' : 'var(--bg-surface)',
                      border: `1px solid ${role === 'JUGADOR' ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                      borderRadius: 'var(--radius-md)',
                      padding: '0.75rem 0.5rem',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.35rem',
                      color: role === 'JUGADOR' ? '#ffffff' : 'var(--text-muted)',
                      cursor: 'pointer',
                    }}
                  >
                    <UserIcon size={20} color={role === 'JUGADOR' ? 'var(--accent-primary)' : 'currentColor'} />
                    <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>Jugador</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRole('DUEÑO')}
                    style={{
                      background: role === 'DUEÑO' ? 'rgba(6, 182, 212, 0.2)' : 'var(--bg-surface)',
                      border: `1px solid ${role === 'DUEÑO' ? 'var(--accent-cyan)' : 'var(--border-subtle)'}`,
                      borderRadius: 'var(--radius-md)',
                      padding: '0.75rem 0.5rem',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.35rem',
                      color: role === 'DUEÑO' ? '#ffffff' : 'var(--text-muted)',
                      cursor: 'pointer',
                    }}
                  >
                    <ShieldCheck size={20} color={role === 'DUEÑO' ? 'var(--accent-cyan)' : 'currentColor'} />
                    <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>Dueño</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRole('PROFESOR')}
                    style={{
                      background: role === 'PROFESOR' ? 'rgba(163, 230, 53, 0.2)' : 'var(--bg-surface)',
                      border: `1px solid ${role === 'PROFESOR' ? 'var(--accent-secondary)' : 'var(--border-subtle)'}`,
                      borderRadius: 'var(--radius-md)',
                      padding: '0.75rem 0.5rem',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.35rem',
                      color: role === 'PROFESOR' ? '#ffffff' : 'var(--text-muted)',
                      cursor: 'pointer',
                    }}
                  >
                    <GraduationCap size={20} color={role === 'PROFESOR' ? 'var(--accent-secondary)' : 'currentColor'} />
                    <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>Profesor</span>
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Teléfono / WhatsApp</label>
                <input
                  type="tel"
                  className="form-input"
                  placeholder="Ej: 291 4567890"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </>
          )}

          <div className="form-group">
            <label className="form-label">Email *</label>
            <input
              type="email"
              required
              className="form-input"
              placeholder="tu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Contraseña *</label>
            <input
              type="password"
              required
              minLength={6}
              className="form-input"
              placeholder="Mínimo 6 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary btn-lg"
            style={{ width: '100%', marginTop: '0.75rem', fontWeight: 700 }}
          >
            {loading ? 'Procesando...' : mode === 'login' ? 'Ingresar a mi cuenta' : 'Crear mi cuenta'}
          </button>
        </form>

        {/* 1-Click Demo Accounts */}
        <div style={{
          marginTop: '2rem',
          borderTop: '1px solid var(--border-subtle)',
          paddingTop: '1.5rem',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.4rem',
            fontSize: '0.75rem',
            fontWeight: 700,
            color: 'var(--text-muted)',
            textAlign: 'center',
            marginBottom: '0.85rem',
            letterSpacing: '0.05em',
          }}>
            <Zap size={14} />
            <span>ACCESO RÁPIDO CON CUENTAS DEMO (1-CLICK)</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => handleDemo('DUEÑO')}
              style={{ fontSize: '0.75rem', padding: '0.5rem 0.25rem' }}
            >
              <ShieldCheck size={14} color="#38bdf8" />
              <span>Dueño</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => handleDemo('PROFESOR')}
              style={{ fontSize: '0.75rem', padding: '0.5rem 0.25rem' }}
            >
              <GraduationCap size={14} color="#a3e635" />
              <span>Profesor</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => handleDemo('JUGADOR')}
              style={{ fontSize: '0.75rem', padding: '0.5rem 0.25rem' }}
            >
              <UserIcon size={14} color="#34d399" />
              <span>Jugador</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
