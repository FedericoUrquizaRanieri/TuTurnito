import React, { useEffect, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { DollarSign, Wallet, AlertCircle, TrendingUp, CalendarCheck, Users, Percent } from 'lucide-react';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { StatCard } from '../StatCard';
import { EmptyState } from '../EmptyState';
import { WhatsappButton } from '../WhatsappButton';
import { SERIES, money, moneyShort, percent, RangePicker, RangeKey, rangeFor, ChartCard, SeriesLegend, makeTooltip, AXIS_PROPS, GRID_PROPS } from '../analytics/charts';
import { shortDateLabel } from '../../lib/dates';
import type { ProfessorAnalytics } from '../../types';

const MoneyTooltip = makeTooltip((v) => money(v));

/** Professor's "Analíticas" tab: income vs. court cost, attendance, class occupancy and students. */
export const ProfessorAnalyticsPanel: React.FC = () => {
  const toast = useToast();
  const [rangeKey, setRangeKey] = useState<RangeKey>('THIS_MONTH');
  const [data, setData] = useState<ProfessorAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const { from, to } = rangeFor(rangeKey);
    setLoading(true);
    api.analytics
      .professor(from, to)
      .then((res) => !cancelled && setData(res))
      .catch((err) => !cancelled && toast.error(err, 'No se pudieron calcular las analíticas.'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [rangeKey, toast]);

  const k = data?.kpis;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h3 className="panel-section-title">Tus números</h3>
          <p className="panel-section-sub">
            {data ? `${shortDateLabel(data.range.from)} al ${shortDateLabel(data.range.to)}` : 'Cargando...'} · se cuentan las clases que ya se dieron.
          </p>
        </div>
        <RangePicker value={rangeKey} onChange={setRangeKey} />
      </div>

      {loading && !data ? (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>Calculando...</div>
      ) : !data || !k ? null : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s' }}>
          <div className="kpi-grid">
            <StatCard icon={<DollarSign size={22} />} iconBg="rgba(58, 122, 240, 0.15)" iconColor="var(--accent-primary)" label={`Facturado (${k.classesGiven} clases)`} value={money(k.billed)} />
            <StatCard icon={<Wallet size={22} />} iconBg="rgba(52, 199, 149, 0.15)" iconColor="var(--status-available)" label="Cobrado" value={money(k.collected)} />
            <StatCard icon={<TrendingUp size={22} />} iconBg="rgba(43, 179, 163, 0.15)" iconColor="var(--accent-cyan)" label={`Margen (canchas: ${money(k.courtCost)})`} value={money(k.margin)} />
            <StatCard icon={<AlertCircle size={22} />} iconBg="rgba(242, 165, 61, 0.15)" iconColor="var(--accent-secondary)" label={`Deuda hoy (${k.studentsOwing} alumnos)`} value={money(k.debtTotal)} />
            <StatCard icon={<CalendarCheck size={22} />} iconBg="rgba(58, 122, 240, 0.15)" iconColor="var(--accent-primary)" label="Asistencia" value={percent(k.attendancePct)} />
            <StatCard icon={<Percent size={22} />} iconBg="rgba(58, 122, 240, 0.15)" iconColor="var(--accent-primary)" label={`Cupos ocupados (${k.freeSeats} libres)`} value={percent(k.occupancyPct)} />
            <StatCard icon={<Users size={22} />} iconBg="rgba(43, 179, 163, 0.15)" iconColor="var(--accent-cyan)" label={`Alumnos activos (+${k.newStudents} / −${k.leftStudents})`} value={k.activeStudents} />
          </div>

          <ChartCard title="Ingresos y costo de canchas" subtitle={`Por ${data.range.granularity === 'day' ? 'día' : data.range.granularity === 'week' ? 'semana' : 'mes'}. El costo de canchas es lo que te cobra el complejo por los turnos de tus clases.`}>
            <SeriesLegend
              items={[
                { label: 'Facturado a alumnos', color: SERIES[0] },
                { label: 'Costo de canchas', color: SERIES[1] },
                { label: 'Cobrado', color: SERIES[2] },
              ]}
            />
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.series} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barGap={2} barCategoryGap="22%">
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="label" {...AXIS_PROPS} interval="preserveStartEnd" minTickGap={12} />
                  <YAxis {...AXIS_PROPS} tickFormatter={moneyShort} width={48} />
                  <Tooltip content={<MoneyTooltip />} cursor={{ fill: 'rgba(244, 246, 241, 0.05)' }} />
                  <Bar dataKey="billed" name="Facturado" fill={SERIES[0]} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="courtCost" name="Costo de canchas" fill={SERIES[1]} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="collected" name="Cobrado" fill={SERIES[2]} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <div className="analytics-grid">
            <ChartCard title="Asistencia por alumno" subtitle="Primero los que más faltan. Las faltas no se cobran.">
              {data.attendance.length === 0 ? (
                <EmptyState message="Sin clases dadas en este período." padding="1.5rem" />
              ) : (
                <div style={{ overflowX: 'auto', maxHeight: 320, overflowY: 'auto' }}>
                  <table className="analytics-table">
                    <thead>
                      <tr>
                        <th>Alumno</th>
                        <th className="num">Vino</th>
                        <th className="num">Faltó</th>
                        <th className="num">Asistencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.attendance.map((a) => (
                        <tr key={a.studentId}>
                          <td>{a.name}</td>
                          <td className="num">{a.attended}</td>
                          <td className="num">{a.missed}</td>
                          <td className="num" style={{ color: a.pct < 70 ? 'var(--accent-secondary)' : undefined, fontWeight: 700 }}>{percent(a.pct)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </ChartCard>

            <ChartCard title="Alumnos que deben" subtitle="Saldo a hoy, de todas las clases">
              {data.debtors.length === 0 ? (
                <EmptyState message="Nadie te debe. ¡Bien ahí!" padding="1.5rem" />
              ) : (
                <table className="analytics-table">
                  <tbody>
                    {data.debtors.map((d) => (
                      <tr key={d.studentId}>
                        <td>
                          <div>{d.name}</div>
                          {d.phone && <div style={{ fontSize: '0.72rem', color: 'var(--text-subtle)' }}>{d.phone}</div>}
                        </td>
                        <td className="num" style={{ color: 'var(--accent-secondary)', fontWeight: 700 }}>{money(d.owes)}</td>
                        <td className="num">
                          <WhatsappButton
                            phone={d.phone}
                            title={`WhatsApp a ${d.name}`}
                            text={`Hola ${d.name.split(' ')[0]}! Te paso el saldo de las clases: ${money(d.owes)}.`}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </ChartCard>
          </div>

          <div className="analytics-grid">
            <ChartCard title="Clases con lugares libres" subtitle="Cupos para sumar alumnos nuevos (máximo 4 por clase)">
              {data.classesWithRoom.length === 0 ? (
                <EmptyState message="Todas tus clases están completas." padding="1.5rem" />
              ) : (
                <div style={{ overflowX: 'auto', maxHeight: 320, overflowY: 'auto' }}>
                  <table className="analytics-table">
                    <thead>
                      <tr>
                        <th>Clase</th>
                        <th>Lugar</th>
                        <th className="num">Libres</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.classesWithRoom.map((c) => (
                        <tr key={`${c.complexName}_${c.courtName}_${c.dayOfWeek}_${c.startTime}`}>
                          <td style={{ fontWeight: 600 }}>{c.dayLabel} {c.startTime}</td>
                          <td style={{ color: 'var(--text-muted)' }}>{c.complexName} · {c.courtName}</td>
                          <td className="num">{c.free} de 4</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </ChartCard>

            <ChartCard title="Por complejo">
              {data.byComplex.length === 0 ? (
                <EmptyState message="Sin clases dadas en este período." padding="1.5rem" />
              ) : (
                <table className="analytics-table">
                  <thead>
                    <tr>
                      <th>Complejo</th>
                      <th className="num">Clases</th>
                      <th className="num">Facturado</th>
                      <th className="num">Canchas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byComplex.map((c) => (
                      <tr key={c.complexId}>
                        <td>{c.name}</td>
                        <td className="num">{c.classesGiven}</td>
                        <td className="num">{money(c.billed)}</td>
                        <td className="num">{money(c.courtCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </ChartCard>
          </div>
        </div>
      )}
    </div>
  );
};
