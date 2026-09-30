import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Save } from 'lucide-react';
import { Banner } from '../components/Banner';

export const ProfilePage: React.FC = () => {
  const { user, updateProfile } = useAuth();

  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [emailReminders, setEmailReminders] = useState(user?.emailReminders ?? true);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      await updateProfile({ name, email, phone, emailReminders });
      setMessage({ type: 'success', text: 'Perfil actualizado exitosamente.' });
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error al actualizar perfil.' });
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="container" style={{ padding: '6rem 0', textAlign: 'center', color: 'var(--text-muted)' }}>
        Inicia sesión para ver tu perfil.
      </div>
    );
  }

  return (
    <div className="main-content container" style={{ paddingTop: '3.5rem', maxWidth: '560px' }}>
      <div className="card" style={{ padding: '2.5rem 2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--accent-secondary) 0%, var(--accent-primary) 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.5rem',
            fontWeight: 800,
            color: '#0b0f19',
          }}>
            {user.name.charAt(0)}
          </div>
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#ffffff' }}>Mi Perfil</h2>
            <span className="badge badge-role">{user.role}</span>
          </div>
        </div>

        {message && <Banner type={message.type} text={message.text} />}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Nombre y Apellido</label>
            <input
              type="text"
              required
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              type="email"
              required
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Teléfono / WhatsApp</label>
            <input
              type="tel"
              className="form-input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={emailReminders}
                onChange={(e) => setEmailReminders(e.target.checked)}
                style={{ accentColor: 'var(--accent-primary)', width: '18px', height: '18px', marginTop: '0.1rem' }}
              />
              <span>
                <span style={{ fontWeight: 600, display: 'block' }}>Recibir recordatorios por email</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Te avisamos el día anterior a cada partido, con el horario y hasta cuándo podés cancelar.</span>
              </span>
            </label>
          </div>

          <div className="form-group">
            <label className="form-label">Rol en la plataforma</label>
            <input
              type="text"
              disabled
              className="form-input"
              value={user.role}
              style={{ opacity: 0.6, cursor: 'not-allowed' }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '1rem' }}
          >
            <Save size={16} />
            <span>{loading ? 'Guardando...' : 'Guardar Cambios'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
