import React from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';

interface BannerProps {
  type: 'success' | 'error';
  text: string;
  /** Some call sites need a tighter bottom margin than the 1.5rem default. */
  marginBottom?: string;
}

/**
 * Success/error inline message banner — was duplicated (and had already
 * drifted slightly) across ProfilePage, MyReservationsPage, ScheduleGrid and
 * AuthPage. Colors match the app's status tokens (see --status-available /
 * --status-blocked in index.css), same as the majority of the call sites
 * already used before this was extracted.
 */
export const Banner: React.FC<BannerProps> = ({ type, text, marginBottom = '1.5rem' }) => {
  const isSuccess = type === 'success';

  return (
    <div
      style={{
        background: isSuccess ? 'rgba(52, 199, 149, 0.15)' : 'rgba(239, 93, 99, 0.15)',
        border: `1px solid ${isSuccess ? 'rgba(52, 199, 149, 0.3)' : 'rgba(239, 93, 99, 0.3)'}`,
        borderRadius: 'var(--radius-md)',
        padding: '0.75rem 1rem',
        color: isSuccess ? '#5cd9a8' : '#ff8489',
        fontSize: '0.875rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        marginBottom,
      }}
    >
      {isSuccess ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
      <span>{text}</span>
    </div>
  );
};
