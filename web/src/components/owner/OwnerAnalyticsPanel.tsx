import React, { useEffect, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { Percent, DollarSign, Clock, CalendarX, Receipt } from 'lucide-react';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { StatCard } from '../StatCard';
import { EmptyState } from '../EmptyState';
import { Heatmap } from '../analytics/Heatmap';
import {
  SERIES,
  money,
  moneyShort,
  percent,
  RangePicker,
  RangeKey,
  rangeFor,
  ChartCard,
  SeriesLegend,
  makeTooltip,
  AXIS_PROPS,
  GRID_PROPS,
  BarList,
} from '../analytics/charts';
import { shortDateLabel } from '../../lib/dates';
import type { ComplexAnalytics } from '../../types';

const RevenueTooltip = makeTooltip((v) => money(v));
const OccupancyTooltip = makeTooltip((v) => percent(v));

/** Owner's "Analíticas" tab: occupancy, revenue, peak hours, best clients and cancellations of a period. */
export const OwnerAnalyticsPanel: React.FC<{ complexId: string }> = ({ complexId }) => {
  const toast = useToast();
  const [rangeKey, setRangeKey] = useState<RangeKey>('THIS_MONTH');
  const [data, setData] = useState<ComplexAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const { from, to } = rangeFor(rangeKey);
    setLoading(true);
    api.analytics
      .complex(complexId, from, to)
      .then((res) => !cancelled && setData(res))
      .catch((err) => !cancelled && toast.error(err, 'No se pudieron calcular las analíticas.'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [complexId, rangeKey, toast]);

  const series = data?.series.map((s) => ({ ...s, pending: s.revenue - s.collected })) ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h3 className="panel-section-title">Analíticas del complejo</h3>
          <p className="panel-section-sub">
            {data ? `${shortDateLabel(data.range.from)} al ${shortDateLabel(data.range.effectiveTo)}` : 'Cargando...'} · los días futuros no se cuentan hasta que pasen.
          </p>
        </div>
        <RangePicker value={rangeKey} onChange={setRangeKey} />
      </div>

      {loading && !data ? (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>Calculando...</div>
      ) : !data ? null : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s' }}>
          <div className="kpi-grid">
            <StatCard icon={<Percent size={22} />} iconBg="rgba(58, 122, 240, 0.15)" iconColor="var(--accent-primary)" label={`Ocupación (${data.kpis.occupiedTurns} de ${data.kpis.capacity} turnos)`} value={percent(data.kpis.occupancyPct)} />
            <StatCard icon={<DollarSign size={22} />} iconBg="rgba(52, 199, 149, 0.15)" iconColor="var(--status-available)" label="Cobrado" value={money(data.kpis.collected)} />
            <StatCard icon={<Clock size={22} />} iconBg="rgba(242, 165, 61, 0.15)" iconColor="var(--accent-secondary)" label="Pendiente de cobro" value={money(data.kpis.pending)} />
            <StatCard icon={<Receipt size={22} />} iconBg="rgba(43, 179, 163, 0.15)" iconColor="var(--accent-cyan)" label={`${data.kpis.reservations} reservas · ticket promedio`} value={money(data.kpis.avgTicket)} />
            <StatCard icon={<CalendarX size={22} />} iconBg="rgba(239, 93, 99, 0.15)" iconColor="var(--status-blocked)" label={`Cancelaciones (${data.kpis.lateCancellations} con menos de 24 h)`} value={data.kpis.cancellations} />
          </div>

          <div className="analytics-grid">
            <ChartCard title="Facturación" subtitle={`Total ${money(data.kpis.billed)} · por ${data.range.granularity === 'day' ? 'día' : data.range.granularity === 'week' ? 'semana' : 'mes'}`}>
              <SeriesLegend items={[{ label: 'Cobrado', color: SERIES[0] }, { label: 'Pendiente', color: SERIES[1] }]} />
              <div style={{ height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={series} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="20%">
                    <CartesianGrid {...GRID_PROPS} />
                    <XAxis dataKey="label" {...AXIS_PROPS} interval="preserveStartEnd" minTickGap={12} />
                    <YAxis {...AXIS_PROPS} tickFormatter={moneyShort} width={48} />
                    <Tooltip content={<RevenueTooltip />} cursor={{ fill: 'rgba(244, 246, 241, 0.05)' }} />
                    <Bar dataKey="collected" name="Cobrado" stackId="a" fill={SERIES[0]} stroke="var(--bg-card)" strokeWidth={1} />
                    <Bar dataKey="pending" name="Pendiente" stackId="a" fill={SERIES[1]} stroke="var(--bg-card)" strokeWidth={1} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Ocupación" subtitle="Turnos reservados sobre los disponibles (sin contar bloqueos ni torneos)">
              <div style={{ height: 262 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid {...GRID_PROPS} />
                    <XAxis dataKey="label" {...AXIS_PROPS} interval="preserveStartEnd" minTickGap={12} />
                    <YAxis {...AXIS_PROPS} domain={[0, 100]} tickFormatter={(v) => `${v}%`} width={40} />
                    <Tooltip content={<OccupancyTooltip />} cursor={{ stroke: 'var(--text-subtle)', strokeDasharray: '3 3' }} />
                    <Line type="monotone" dataKey="occupancyPct" name="Ocupación" stroke={SERIES[0]} strokeWidth={2} dot={series.length <= 12 ? { r: 3, fill: SERIES[0] } : false} activeDot={{ r: 5, stroke: 'var(--bg-card)', strokeWidth: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          </div>

          <ChartCard title="Horarios pico y horarios muertos" subtitle="Ocupación por día de la semana y hora de inicio. Ideal para decidir precios por franja.">
            <Heatmap data={data.heatmap} />
          </ChartCard>

          <div className="analytics-grid">
            <ChartCard title="Ingresos por tipo de reserva">
              <BarList
                rows={[
                  { label: 'Turnos eventuales', value: data.byType.oneOff.revenue, display: money(data.byType.oneOff.revenue), sub: `${data.byType.oneOff.count} reservas` },
                  { label: 'Turnos fijos', value: data.byType.fixed.revenue, display: money(data.byType.fixed.revenue), sub: `${data.byType.fixed.count} reservas` },
                  { label: 'Clases de profesores', value: data.byType.classes.revenue, display: money(data.byType.classes.revenue), sub: `${data.byType.classes.count} clases` },
                ]}
              />
            </ChartCard>

            <ChartCard title="Por cancha">
              {data.byCourt.length === 0 ? (
                <EmptyState message="Sin datos en este período." padding="1.5rem" />
              ) : (
                <table className="analytics-table">
                  <thead>
                    <tr>
                      <th>Cancha</th>
                      <th className="num">Ocupación</th>
                      <th className="num">Turnos</th>
                      <th className="num">Facturado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byCourt.map((c) => (
                      <tr key={c.courtId}>
                        <td>{c.name}</td>
                        <td className="num">{percent(c.occupancyPct)}</td>
                        <td className="num">{c.occupied}/{c.capacity}</td>
                        <td className="num">{money(c.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </ChartCard>
          </div>

          <div className="analytics-grid">
            <ChartCard title="Mejores clientes" subtitle="Los que más reservaron en el período (agrupados por teléfono)">
              {data.topClients.length === 0 ? (
                <EmptyState message="Sin reservas de jugadores en este período." padding="1.5rem" />
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="analytics-table">
                    <thead>
                      <tr>
                        <th>Cliente</th>
                        <th className="num">Reservas</th>
                        <th className="num">Pagó</th>
                        <th className="num">Debe</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topClients.map((c) => (
                        <tr key={c.phone + c.name}>
                          <td>
                            <div style={{ fontWeight: 600 }}>{c.name}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-subtle)' }}>{c.phone} · última: {shortDateLabel(c.lastDate)}</div>
                          </td>
                          <td className="num">{c.reservations}</td>
                          <td className="num">{money(c.spent)}</td>
                          <td className="num" style={{ color: c.owed > 0 ? 'var(--accent-secondary)' : undefined }}>{c.owed > 0 ? money(c.owed) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </ChartCard>

            <ChartCard title="Cancelaciones" subtitle={`${data.cancellations.total} en el período`}>
              <BarList
                rows={[
                  { label: 'Con menos de 24 h', value: data.cancellations.byLead.under24h, display: String(data.cancellations.byLead.under24h) },
                  { label: 'Entre 24 y 48 h antes', value: data.cancellations.byLead.from24to48h, display: String(data.cancellations.byLead.from24to48h) },
                  { label: 'Con más de 48 h', value: data.cancellations.byLead.over48h, display: String(data.cancellations.byLead.over48h) },
                ]}
              />
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '1rem', marginBottom: 0 }}>
                Canceló el jugador: <strong>{data.cancellations.byWho.PLAYER}</strong> · vos: <strong>{data.cancellations.byWho.OWNER}</strong> · un profesor: <strong>{data.cancellations.byWho.PROFESSOR}</strong>.
                {data.cancellations.byLead.under24h > 0 && ' Si las cancelaciones de último momento te dejan turnos vacíos, subí las horas mínimas en Datos del Complejo.'}
              </p>
            </ChartCard>
          </div>
        </div>
      )}
    </div>
  );
};
