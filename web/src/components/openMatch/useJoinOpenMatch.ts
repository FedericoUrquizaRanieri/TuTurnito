import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import type { OpenMatchSummary } from '../../types';

/** Join handler for open match cards: sends guests to log in first, then joins and reloads the list. */
export function useJoinOpenMatch(reload: () => void) {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [busyId, setBusyId] = useState<string | null>(null);

  const join = async (match: OpenMatchSummary) => {
    if (!user) {
      toast.info('Ingresá o creá tu cuenta para sumarte al partido.');
      navigate(`/auth?mode=login&redirect=${encodeURIComponent(location.pathname)}`);
      return;
    }
    if (!confirm(`¿Te sumás al partido del ${match.date} a las ${match.startTime} hs en ${match.complex.name}?`)) return;
    setBusyId(match.id);
    try {
      await api.openMatches.join(match.id);
      toast.success('¡Te sumaste! Lo vas a ver en Mis reservas con el contacto del organizador.');
      reload();
    } catch (err) {
      toast.error(err, 'No te pudimos sumar al partido.');
      reload();
    } finally {
      setBusyId(null);
    }
  };

  return { join, busyId };
}
