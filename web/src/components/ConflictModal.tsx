import React from 'react';
import { AlertTriangle, X, CheckCircle2, Trash2, GraduationCap, User as UserIcon } from 'lucide-react';

interface ConflictItem {
  reservationId: string;
  courtName: string;
  date: string;
  time: string;
  guestName: string;
  type: string;
}

interface ConflictModalProps {
  conflicts: ConflictItem[];
  conflictType: string;
  onResolve: (decision: 'KEEP' | 'CANCEL') => void;
  onClose: () => void;
  loading: boolean;
}

export const ConflictModal: React.FC<ConflictModalProps> = ({
  conflicts,
  onResolve,
  onClose,
  loading,
}) => {
  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '620px' }}>
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '1.25rem',
            right: '1.25rem',
            color: 'var(--text-muted)',
          }}
        >
          <X size={20} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            background: 'rgba(239, 93, 99, 0.15)',
            color: 'var(--status-blocked)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <AlertTriangle size={24} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Conflicto con reservas futuras</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Los cambios que deseas guardar afectan a <strong>{conflicts.length}</strong> reserva(s) ya confirmadas.
            </p>
          </div>
        </div>

        <div style={{
          background: 'var(--bg-surface)',
          borderRadius: 'var(--radius-md)',
          padding: '1rem',
          maxHeight: '220px',
          overflowY: 'auto',
          marginBottom: '1.5rem',
          border: '1px solid var(--border-subtle)',
        }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
            Reservas Afectadas:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {conflicts.map((c, i) => (
              <div
                key={i}
                style={{
                  background: 'var(--bg-card)',
                  padding: '0.6rem 0.8rem',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '0.825rem',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                    {c.courtName} • {c.date} ({c.time})
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                    <span>A nombre de: <strong>{c.guestName}</strong></span>
                    {c.type === 'CLASS' ? <GraduationCap size={13} /> : <UserIcon size={13} />}
                    <span>{c.type === 'CLASS' ? '(Clase)' : '(Jugador)'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
          ¿Cómo deseas resolver este conflicto antes de persistir los cambios en el Excel de canchas?
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <button
            className="btn btn-primary"
            disabled={loading}
            onClick={() => onResolve('KEEP')}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            <CheckCircle2 size={18} />
            <span>Conservar reservas existentes y bloquear turnos libres</span>
          </button>

          <button
            className="btn btn-danger"
            disabled={loading}
            onClick={() => onResolve('CANCEL')}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            <Trash2 size={18} />
            <span>Cancelar estas reservas y aplicar bloqueo total</span>
          </button>

          <button
            className="btn btn-secondary"
            disabled={loading}
            onClick={onClose}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            Volver sin guardar
          </button>
        </div>
      </div>
    </div>
  );
};
