import React, { useEffect, useRef } from 'react';
import { DAY_NAMES_SHORT, addDays, parseDate, todayStr } from '../lib/dates';

interface DatePillStripProps {
  /** First date shown (YYYY-MM-DD). */
  from: string;
  /** How many consecutive days to show. */
  count: number;
  selected: string;
  onSelect: (dateStr: string) => void;
}

/**
 * Horizontal strip of date pills — the public calendar shows the next 14
 * days, the owner's reservations grid shows one week back plus two ahead
 * (past days dimmed, today outlined).
 */
export const DatePillStrip: React.FC<DatePillStripProps> = ({ from, count, selected, onSelect }) => {
  const today = todayStr();
  const tomorrow = addDays(today, 1);
  const stripRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  // Keep the selected pill in view when the strip starts in the past.
  // Scrolls only the strip itself (scrollIntoView would also move the page).
  useEffect(() => {
    const strip = stripRef.current;
    const pill = selectedRef.current;
    if (!strip || !pill) return;
    const target = pill.offsetLeft - strip.offsetLeft - (strip.clientWidth - pill.clientWidth) / 2;
    strip.scrollLeft = Math.max(0, target);
  }, [selected]);

  const days = Array.from({ length: count }).map((_, i) => {
    const dateStr = addDays(from, i);
    const d = parseDate(dateStr);
    return {
      dateStr,
      dayNumber: d.getDate(),
      dayName: dateStr === today ? 'Hoy' : dateStr === tomorrow ? 'Mañana' : DAY_NAMES_SHORT[d.getDay()],
      monthName: d.toLocaleString('es-AR', { month: 'short' }),
    };
  });

  return (
    <div
      ref={stripRef}
      style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.75rem' }}
      role="tablist"
      aria-label="Elegir fecha"
    >
      {days.map((day) => {
        const isSelected = selected === day.dateStr;
        const classes = [
          'date-pill',
          day.dateStr < today ? 'is-past' : '',
          day.dateStr === today ? 'is-today' : '',
          isSelected ? 'is-selected' : '',
        ].filter(Boolean).join(' ');

        return (
          <button
            key={day.dateStr}
            ref={isSelected ? selectedRef : undefined}
            role="tab"
            aria-selected={isSelected}
            className={classes}
            onClick={() => onSelect(day.dateStr)}
          >
            <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', opacity: isSelected ? 0.9 : 0.7 }}>
              {day.dayName}
            </span>
            <span style={{ fontSize: '1.3rem', fontWeight: 800, lineHeight: 1 }}>{day.dayNumber}</span>
            <span style={{ fontSize: '0.7rem', fontWeight: 600, opacity: isSelected ? 0.9 : 0.7 }}>{day.monthName}</span>
          </button>
        );
      })}
    </div>
  );
};
