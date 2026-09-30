import React, { useState } from 'react';
import { Users, UserMinus, Phone, Pencil, XCircle, LogOut } from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { OpenMatchFields } from './OpenMatchFields';
import type { MyReservation, OpenMatchInput } from '../../types';

interface MyOpenMatchPanelProps {
  reservation: MyReservation;
  onChanged: () => void;
}

const panelStyle: React.CSSProperties = {
  background: 'rgba(242, 165, 61, 0.07)',
  border: '1px solid rgba(242, 165, 61, 0.25)',
  borderRadius: 'var(--radius-md)',
  padding: '0.85rem 1rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.7rem',
};

/**
 * The open match block of an upcoming reservation in "Mis reservas":
 * - the booker publishes it ("Buscar jugadores"), edits it, removes players or stops looking;
 * - a player who joined sees the organizer and the other players, and can leave.
 */
export const MyOpenMatchPanel: React.FC<MyOpenMatchPanelProps> = ({ reservation: r, onChanged }) => {
  const { user } = useAuth();
  const toast = useToast();
  const m = r.openMatch;
  const isOrganizer = r.role === 'BOOKER';
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<OpenMatchInput>({ spots: m?.spots ?? 1, category: m?.category ?? null, notes: m?.notes ?? '' });
  const [busy, setBusy] = useState(false);

  // Only player bookings made with an account can look for players.
  if (!m && (!isOrganizer || r.type !== 'PLAYER')) return null;

  const run = async (action: () => Promise<unknown>, success: string, fallback: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      setEditing(false);
      onChanged();
    } catch (err) {
      toast.error(err, fallback);
    } finally {
      setBusy(false);
    }
  };

  const payload = () => ({ ...form, notes: form.notes?.trim() || null });

  if (!m) {
    return editing ? (
      <div style={panelStyle}>
        <OpenMatchFields value={form} onChange={setForm} />
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setEditing(false)} disabled={busy}>Cancelar</button>
          <button
            className="btn btn-lime btn-sm"
            disabled={busy}
            onClick={() => run(() => api.reservations.openMatch(r.id, payload()), 'Partido publicado en Partidos abiertos.', 'No se pudo publicar el partido.')}
          >
            <Users size={14} />
            <span>Publicar</span>
          </button>
        </div>
      </div>
    ) : (
      <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setEditing(true)}>
        <Users size={14} />
        <span>Buscar jugadores</span>
      </button>
    );
  }

  const spotsLeft = m.spots - m.joinedCount;

  return (
    <div style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800 }}>
          <Users size={16} color="var(--accent-secondary)" />
          <span>Partido abierto · {spotsLeft > 0 ? `faltan ${spotsLeft}` : 'completo'}</span>
          {m.category && <span className="badge badge-role" style={{ fontSize: '0.65rem' }}>{m.category}</span>}
        </div>
        {isOrganizer && !editing && (
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)} disabled={busy} style={{ padding: '0.3rem 0.6rem' }}>
              <Pencil size={13} />
              <span>Editar</span>
            </button>
            <button
              className="btn btn-secondary btn-sm"
              disabled={busy}
              style={{ padding: '0.3rem 0.6rem' }}
              onClick={() => {
                if (!confirm('¿Dejar de buscar jugadores? Los que se sumaron reciben un aviso por email.')) return;
                run(() => api.reservations.closeOpenMatch(r.id), 'El partido ya no está publicado.', 'No se pudo cerrar el partido.');
              }}
            >
              <XCircle size={13} />
              <span>Dejar de buscar</span>
            </button>
          </div>
        )}
      </div>

      {editing && (
        <>
          <OpenMatchFields value={form} onChange={setForm} minSpots={Math.max(1, m.joinedCount)} />
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setEditing(false)} disabled={busy}>Cancelar</button>
            <button
              className="btn btn-lime btn-sm"
              disabled={busy}
              onClick={() => run(() => api.reservations.updateOpenMatch(r.id, payload()), 'Partido actualizado.', 'No se pudo actualizar el partido.')}
            >
              Guardar
            </button>
          </div>
        </>
      )}

      {m.notes && !editing && <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>“{m.notes}”</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem' }}>
        {!isOrganizer && (
          <PlayerRow name={`${m.organizer.name} (organiza)`} phone={m.organizer.phone} />
        )}
        {m.players.length === 0 ? (
          <span style={{ color: 'var(--text-muted)' }}>Todavía no se sumó nadie. Te avisamos por email.</span>
        ) : (
          m.players.map((p) => (
            <PlayerRow
              key={p.userId}
              name={p.userId === user?.id ? `${p.name} (vos)` : p.name}
              phone={p.userId === user?.id ? null : p.phone}
              onRemove={
                isOrganizer
                  ? () => {
                      if (!confirm(`¿Sacar a ${p.name} del partido? Le llega un aviso por email.`)) return;
                      run(() => api.openMatches.removePlayer(m.id, p.userId), `${p.name} ya no está en el partido.`, 'No se pudo sacar al jugador.');
                    }
                  : undefined
              }
              busy={busy}
            />
          ))
        )}
      </div>

      {!isOrganizer && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            {r.canCancel ? 'Si no podés ir, bajate así el organizador busca a otro.' : 'Ya pasó el plazo para bajarte desde la app: avisale al organizador.'}
          </span>
          {r.canCancel && (
            <button
              className="btn btn-danger btn-sm"
              disabled={busy}
              onClick={() => {
                if (!confirm('¿Bajarte del partido? El organizador recibe un aviso.')) return;
                run(() => api.openMatches.leave(m.id), 'Te bajaste del partido.', 'No te pudimos bajar del partido.');
              }}
            >
              <LogOut size={14} />
              <span>Bajarme</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const PlayerRow: React.FC<{ name: string; phone: string | null; onRemove?: () => void; busy?: boolean }> = ({
  name,
  phone,
  onRemove,
  busy,
}) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
    <span style={{ fontWeight: 600 }}>{name}</span>
    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      {phone && (
        <a href={`tel:${phone}`} style={{ color: 'var(--text-muted)', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
          <Phone size={12} /> {phone}
        </a>
      )}
      {onRemove && (
        <button className="btn btn-danger btn-sm" onClick={onRemove} disabled={busy} style={{ padding: '0.25rem 0.5rem' }} title="Sacar del partido">
          <UserMinus size={13} />
        </button>
      )}
    </span>
  </div>
);
