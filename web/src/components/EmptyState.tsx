import React from 'react';

interface EmptyStateProps {
  message: string;
  padding?: string;
  textAlign?: 'center' | 'left';
  marginBottom?: string;
}

/** Simple "no data yet" card — icon-less message box, reused across both dashboards' list views. */
export const EmptyState: React.FC<EmptyStateProps> = ({ message, padding = '3rem', textAlign = 'center', marginBottom }) => (
  <div
    style={{
      textAlign,
      padding,
      background: 'var(--bg-card)',
      borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--border-subtle)',
      color: 'var(--text-muted)',
      ...(marginBottom ? { marginBottom } : {}),
    }}
  >
    {message}
  </div>
);
