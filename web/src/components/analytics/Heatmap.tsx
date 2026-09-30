import React from 'react';

export interface HeatmapData {
  hours: string[];
  days: { dayOfWeek: number; label: string; cells: { hour: string; capacity: number; occupied: number; pct: number | null }[] }[];
}

/** Sequential single-hue ramp (blue), light -> strong with occupancy. */
function cellColor(pct: number | null): string {
  if (pct === null) return 'transparent';
  return `rgba(58, 122, 240, ${0.08 + (pct / 100) * 0.87})`;
}

/**
 * Occupancy by weekday × start hour, as a CSS grid (Recharts has no heatmap).
 * Hovering or focusing a cell shows its exact numbers; the legend explains the ramp.
 */
export const Heatmap: React.FC<{ data: HeatmapData }> = ({ data }) => {
  if (data.hours.length === 0) return <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Sin turnos en este período.</p>;
  return (
    <div>
      <div className="heatmap-scroll">
        <div className="heatmap" style={{ gridTemplateColumns: `40px repeat(${data.hours.length}, minmax(26px, 1fr))` }} role="table" aria-label="Ocupación por día y hora">
          <div />
          {data.hours.map((h) => (
            <div key={h} className="heatmap-hour" role="columnheader">{h}</div>
          ))}
          {data.days.map((d) => (
            <React.Fragment key={d.dayOfWeek}>
              <div className="heatmap-day" role="rowheader">{d.label}</div>
              {d.cells.map((c) => {
                const text = c.pct === null ? `${d.label} ${c.hour} hs: sin turnos` : `${d.label} ${c.hour} hs: ${c.pct.toLocaleString('es-AR')}% (${c.occupied} de ${c.capacity} turnos)`;
                return (
                  <div
                    key={c.hour}
                    className="heatmap-cell"
                    role="cell"
                    tabIndex={c.pct === null ? -1 : 0}
                    title={text}
                    aria-label={text}
                    style={{ background: cellColor(c.pct), border: c.pct === null ? '1px dashed var(--border-subtle)' : undefined }}
                  />
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.72rem', color: 'var(--text-subtle)', marginTop: '0.6rem' }}>
        <span>0%</span>
        <span style={{ width: 120, height: 8, borderRadius: 4, background: 'linear-gradient(90deg, rgba(58,122,240,0.08), rgba(58,122,240,0.95))' }} />
        <span>100% ocupado</span>
      </div>
    </div>
  );
};
