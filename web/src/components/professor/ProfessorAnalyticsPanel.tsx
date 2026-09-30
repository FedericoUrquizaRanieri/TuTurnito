import React, { useEffect, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { DollarSign, Wallet, TrendingUp, AlertCircle, CalendarCheck, Users, Percent, Building } from 'lucide-react';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { EmptyState } from '../EmptyState';
import { WhatsappButton } from '../WhatsappButton';
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
  MetricGroup,
} from '../analytics/charts';
import { shortDateLabel } from '../../lib/dates';
import type { ProfessorAnalytics } from '../../types';

const MoneyTooltip = makeTooltip((v) => money(v));

// Monday first, like the weekly class grid.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Free seats of the weekly classes, grouped by weekday as time chips. */
function FreeSeatsByDay({ classes, multiComplex }: { classes: ProfessorAnalytics['classesWithRoom']; multiComplex: boolean }) {
  const days = WEEK_ORDER.map((dow) => ({ dow, items: classes.filter((c) => c.dayOfWeek === dow) })).filter((d) => d.items.length > 0);
  return (
    <div>
      {days.map((d) => (
        <div key={d.dow} className="free-slots-day">
          <div className="free-slots-day-label">{d.items[0].dayLabel}</div>
          <div>
            {d.items.map((c) => (
              <span
                key={`${c.complexName}_${c.courtName}_${c.startTime}`}
                className="free-slot-chip"
                title={`${c.complexName} · ${c.courtName}: ${c.enrolled} de 4 alumnos`}
              >
                <strong>{c.startTime}</strong>
                <span className="seats">{c.enrolled === 0 ? 'vacía' : plural(c.free, 'libre', 'libres')}</span>
                {multiComplex && <span className="seats">· {c.complexName}</span>}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

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
  const complexNames = new Set(data?.classesWithRoom.map((c) => c.complexName) ?? []);
  const multiComplex = (data?.byComplex.length ?? 0) > 1 || complexNames.size > 1;
  const places = data ? [...new Set(data.classesWithRoom.map((c) => `${c.complexName} · ${c.courtName}`))] : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
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
          <MetricGroup
            title="Plata del período"
            metrics={[
              { label: 'Facturado', value: money(k.billed), sub: plural(k.classesGiven, 'clase dada', 'clases dadas'), icon: <DollarSign size={14} /> },
              { label: 'Costo de canchas', value: money(k.courtCost), sub: 'lo que te cobra el complejo', icon: <Building size={14} /> },
              {
                label: 'Margen',
                value: money(k.margin),
                sub: k.margin < 0 ? 'las canchas costaron más de lo facturado' : 'facturado menos canchas',
                tone: k.margin < 0 ? 'negative' : 'default',
                icon: <TrendingUp size={14} />,
              },
              { label: 'Cobrado', value: money(k.collected), sub: 'pagos registrados', icon: <Wallet size={14} /> },
            ]}
          />

          <MetricGroup
            title="Alumnos y clases"
            metrics={[
              {
                label: 'Deuda a hoy',
                value: money(k.debtTotal),
                sub: k.studentsOwing > 0 ? plural(k.studentsOwing, 'alumno debe', 'alumnos deben') : 'nadie debe',
                tone: k.debtTotal > 0 ? 'warning' : 'default',
                icon: <AlertCircle size={14} />,
              },
              { label: 'Asistencia', value: percent(k.attendancePct), sub: 'de las clases del período', icon: <CalendarCheck size={14} /> },
              { label: 'Cupos ocupados', value: percent(k.occupancyPct), sub: plural(k.freeSeats, 'lugar libre', 'lugares libres'), icon: <Percent size={14} /> },
              { label: 'Alumnos activos', value: String(k.activeStudents), sub: `+${k.newStudents} altas · −${k.leftStudents} bajas`, icon: <Users size={14} /> },
            ]}
          />

          <ChartCard
            title="Ingresos y costo de canchas"
            subtitle={`Por ${data.range.granularity === 'month' ? 'mes' : 'semana'}. Tocá o pasá el mouse por las barras para ver los montos.`}
          >
            <SeriesLegend
              items={[
                { label: 'Facturado a alumnos', color: SERIES[0] },
                { label: 'Costo de canchas', color: SERIES[1] },
                { label: 'Cobrado', color: SERIES[2] },
              ]}
            />
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.series} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barGap={3} barCategoryGap="28%">
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="label" {...AXIS_PROPS} tickFormatter={(l) => (data.range.granularity === 'month' ? l : `Sem. ${l}`)} />
                  <YAxis {...AXIS_PROPS} tickFormatter={moneyShort} width={52} />
                  <Tooltip content={<MoneyTooltip />} cursor={{ fill: 'rgba(244, 246, 241, 0.05)' }} />
                  <Bar dataKey="billed" name="Facturado" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={36} />
                  <Bar dataKey="courtCost" name="Costo de canchas" fill={SERIES[1]} radius={[4, 4, 0, 0]} maxBarSize={36} />
                  <Bar dataKey="collected" name="Cobrado" fill={SERIES[2]} radius={[4, 4, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <div className="analytics-grid">
            <ChartCard title="Alumnos que deben" subtitle="Saldo a hoy, de todas las clases">
              {data.debtors.length === 0 ? (
                <EmptyState message="Nadie te debe. ¡Bien ahí!" padding="1.5rem" />
              ) : (
                <table className="analytics-table">
                  <tbody>
                    {data.debtors.map((d) => (
                      <tr key={d.studentId}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{d.name}</div>
                          {d.phone && <div style={{ fontSize: '0.72rem', color: 'var(--text-subtle)' }}>{d.phone}</div>}
                        </td>
                        <td className="num" style={{ color: 'var(--accent-secondary)', fontWeight: 700 }}>{money(d.owes)}</td>
                        <td className="num" style={{ width: 48 }}>
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

            <ChartCard title="Asistencia por alumno" subtitle="Primero los que más faltan. Las faltas no se cobran.">
              {data.attendance.length === 0 ? (
                <EmptyState message="Sin clases dadas en este período." padding="1.5rem" />
              ) : (
                <div style={{ maxHeight: 300, overflowY: 'auto' }}>
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
                          <td className="num" style={{ fontWeight: 700, color: a.pct < 70 ? 'var(--accent-secondary)' : undefined }}>{percent(a.pct)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </ChartCard>
          </div>

          <ChartCard
            title="Lugares libres en tus clases"
            subtitle={
              data.classesWithRoom.length === 0
                ? 'Máximo 4 alumnos por clase.'
                : `Máximo 4 alumnos por clase${!multiComplex && places.length === 1 ? ` · ${places[0]}` : ''}. Tocá o pasá el mouse por cada horario para ver el detalle.`
            }
          >
            {data.classesWithRoom.length === 0 ? (
              <EmptyState message="Todas tus clases están completas." padding="1.5rem" />
            ) : (
              <FreeSeatsByDay classes={data.classesWithRoom} multiComplex={multiComplex} />
            )}
          </ChartCard>

          {multiComplex && (
            <ChartCard title="Por complejo">
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
            </ChartCard>
          )}
        </div>
      )}
    </div>
  );
};
