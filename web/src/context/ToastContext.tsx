import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, LogIn, WifiOff, X } from 'lucide-react';
import { ApiError, NETWORK_ERROR_STATUS } from '../api/client';

type ToastKind = 'error' | 'success' | 'info';

interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
  /** Offline, or the session expired: shown with a specific icon / action. */
  variant?: 'network' | 'session';
}

interface ToastApi {
  /** Shows the error of a failed action; `fallback` is used when it isn't an API error. */
  error: (err: unknown, fallback?: string) => void;
  success: (text: string) => void;
  info: (text: string) => void;
}

const ToastContext = createContext<ToastApi | undefined>(undefined);

const DURATION_MS: Record<ToastKind, number> = { error: 7000, success: 4000, info: 5000 };
const MAX_TOASTS = 4;
const GENERIC_ERROR = 'Algo salió mal. Probá de nuevo.';

/** The text to show for any error: API errors already carry a user-facing message. */
export function errorText(err: unknown, fallback = GENERIC_ERROR): string {
  if (err instanceof ApiError) return err.message;
  return fallback;
}

/**
 * App-wide notices (toasts): errors of actions and loads that have no inline
 * place to show them, plus confirmations. Errors inside modals and forms keep
 * using their inline Banner.
 */
export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  // Mirrors `toasts` so push() can check what's on screen without a state updater with side effects.
  const shown = useRef<Toast[]>([]);
  shown.current = toasts;

  const push = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      // The same message already on screen (e.g. several loads failing offline) isn't repeated.
      if (shown.current.some((t) => t.text === toast.text)) return;
      const id = nextId.current++;
      timers.current.set(id, window.setTimeout(() => dismiss(id), DURATION_MS[toast.kind]));
      shown.current = [...shown.current, { ...toast, id }].slice(-MAX_TOASTS);
      setToasts(shown.current);
    },
    [dismiss]
  );

  const api = useRef<ToastApi>({
    error: () => undefined,
    success: () => undefined,
    info: () => undefined,
  });
  api.current = {
    error: (err, fallback) => {
      const variant =
        err instanceof ApiError
          ? err.status === NETWORK_ERROR_STATUS
            ? 'network'
            : err.status === 401 && err.message.startsWith('Tu sesión')
            ? 'session'
            : undefined
          : undefined;
      push({ kind: 'error', text: errorText(err, fallback), variant });
    },
    success: (text) => push({ kind: 'success', text }),
    info: (text) => push({ kind: 'info', text }),
  };

  // Safety net: an error nobody caught still reaches the user instead of
  // failing silently in the console.
  useEffect(() => {
    const onUnhandled = (event: PromiseRejectionEvent) => {
      api.current.error(event.reason);
    };
    window.addEventListener('unhandledrejection', onUnhandled);
    return () => window.removeEventListener('unhandledrejection', onUnhandled);
  }, []);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => window.clearTimeout(timer));
  }, []);

  // Stable object so consumers can list it in effect dependencies.
  const [value] = useState<ToastApi>(() => ({
    error: (err, fallback) => api.current.error(err, fallback),
    success: (text) => api.current.success(text),
    info: (text) => api.current.info(text),
  }));

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-relevant="additions">
        {toasts.map((t) => {
          const Icon = t.variant === 'network' ? WifiOff : t.kind === 'error' ? AlertCircle : t.kind === 'success' ? CheckCircle2 : Info;
          return (
            <div key={t.id} className={`toast toast-${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
              <Icon size={18} className="toast-icon" aria-hidden="true" />
              <div className="toast-body">
                <span>{t.text}</span>
                {t.variant === 'session' && (
                  <a className="toast-action" href="/auth?mode=login">
                    <LogIn size={13} aria-hidden="true" /> Iniciar sesión
                  </a>
                )}
              </div>
              <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Cerrar aviso">
                <X size={15} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
