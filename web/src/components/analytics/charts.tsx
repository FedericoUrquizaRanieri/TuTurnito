import React from 'react';
import { addDays, parseDate, formatDate, todayStr } from '../../lib/dates';

// Shared pieces of the owner and professor analytics tabs.

/**
 * Categorical series colors, in fixed order (never cycled). Darker steps of
 * the app's blue / amber / teal so all three sit in the same lightness band
 * and stay distinguishable with color-vision deficiencies on the dark card
 * (checked with the dataviz palette validator against #12253d).
 */
export const SERIES = ['#3a7af0', '#c9801f', '#1d9587'] as const;

/** "57,1%" */
export const percent = (n: number) => `${n.toLocaleString('es-AR')}%`;

/** "$12.000", "−$4.000" */
export const money = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(Math.round(n)).toLocaleString('es-AR')}`;
export const moneyShort = (n: number) => {
  const sign = n < 0 ? '−' : '';
  const a = Math.abs(n);
  return a >= 1_000_000 ? `${sign}$${(a / 1_000_000).toFixed(1).replace('.', ',')}M` : a >= 1000 ? `${sign}$${Math.round(a / 1000)}k` : `${sign}$${a}`;
};

export type RangeKey = 'THIS_MONTH' | 'LAST_MONTH' | 'LAST_3_MONTHS' | 'THIS_YEAR';

export const RANGE_LABELS: Record<RangeKey, string> = {
  THIS_MONTH: 'Este mes',
  LAST_MONTH: 'Mes pasado',
  LAST_3_MONTHS: 'Últimos 3 meses',
  THIS_YEAR: 'Este año',
};

/** The date range of a preset, ending today at the latest. */
export function rangeFor(key: RangeKey): { from: string; to: string } {
  const today = todayStr();
  const d = parseDate(today);
  switch (key) {
    case 'THIS_MONTH':
      return { from: formatDate(new Date(d.getFullYear(), d.getMonth(), 1)), to: today };
    case 'LAST_MONTH':
      return {
        from: formatDate(new Date(d.getFullYear(), d.getMonth() - 1, 1)),
        to: formatDate(new Date(d.getFullYear(), d.getMonth(), 0)),
      };
    case 'LAST_3_MONTHS':
      return { from: addDays(today, -89), to: today };
    case 'THIS_YEAR':
      return { from: formatDate(new Date(d.getFullYear(), 0, 1)), to: today };
  }
}

export const RangePicker: React.FC<{ value: RangeKey; onChange: (key: RangeKey) => void }> = ({ value, onChange }) => (
  <div className="range-picker" role="radiogroup" aria-label="Período">
    {(Object.keys(RANGE_LABELS) as RangeKey[]).map((k) => (
      <button key={k} type="button" role="radio" aria-checked={value === k} className={`range-pill ${value === k ? 'active' : ''}`} onClick={() => onChange(k)}>
        {RANGE_LABELS[k]}
      </button>
    ))}
  </div>
);

export const ChartCard: React.FC<{ title: string; subtitle?: string; children: React.ReactNode; action?: React.ReactNode }> = ({
  title,
  subtitle,
  children,
  action,
}) => (
  <div className="card chart-card">
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '1rem' }}>
      <div>
        <h3 className="panel-section-title" style={{ fontSize: '1rem' }}>{title}</h3>
        {subtitle && <p className="panel-section-sub">{subtitle}</p>}
      </div>
      {action}
    </div>
    {children}
  </div>
);

/** Legend for multi-series charts: swatch + label in text color. */
export const SeriesLegend: React.FC<{ items: { label: string; color: string }[] }> = ({ items }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem 1rem', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>
    {items.map((i) => (
      <span key={i.label} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
        <span style={{ width: 10, height: 10, borderRadius: 3, background: i.color }} />
        {i.label}
      </span>
    ))}
  </div>
);

type TooltipEntry = { name?: string | number; value?: number | string; color?: string; dataKey?: string | number };

/** Recharts tooltip in the app's card style; values formatted by the caller. */
export function makeTooltip(format: (value: number, dataKey: string) => string) {
  const ChartTooltip = ({ active, payload, label }: { active?: boolean; payload?: TooltipEntry[]; label?: string | number }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="chart-tooltip">
        <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>{label}</div>
        {payload.map((p) => (
          <div key={String(p.dataKey)} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color }} />
            <span style={{ color: 'var(--text-muted)' }}>{p.name}</span>
            <strong style={{ marginLeft: 'auto', paddingLeft: '0.75rem' }}>{format(Number(p.value), String(p.dataKey))}</strong>
          </div>
        ))}
      </div>
    );
  };
  return ChartTooltip;
}

export const AXIS_PROPS = {
  stroke: 'var(--text-subtle)',
  tick: { fill: 'var(--text-subtle)', fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

export const GRID_PROPS = { stroke: 'rgba(244, 246, 241, 0.08)', vertical: false } as const;

/** Horizontal magnitude bars for a short list (types, courts): one hue, labels and values in text color. */
export const BarList: React.FC<{ rows: { label: string; value: number; display: string; sub?: string }[] }> = ({ rows }) => {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
      {rows.map((r) => (
        <div key={r.label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
            <span>{r.label}{r.sub && <span style={{ color: 'var(--text-subtle)' }}> · {r.sub}</span>}</span>
            <strong>{r.display}</strong>
          </div>
          <div style={{ height: 8, background: 'var(--bg-surface)', borderRadius: 4 }}>
            <div style={{ width: `${(r.value / max) * 100}%`, height: '100%', background: SERIES[0], borderRadius: 4, minWidth: r.value > 0 ? 4 : 0 }} />
          </div>
        </div>
      ))}
    </div>
  );
};
