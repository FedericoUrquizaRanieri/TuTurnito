import prisma from '../prisma';
import { hasStarted, nowParts, today } from './clock';
import { buildPaymentMap, getPaymentsByPayableIds } from './payment.service';
import { addDays, buildCourtSlots, getDateRange, parseDateString, slotsWithin } from './schedule.service';
import { computeBalances, MAX_STUDENTS_PER_CLASS } from './classSchedule.service';

// Owner analytics for a date range. Everything is aggregated in JS, same as
// the rest of the app: a year of a 4-court complex is ~15k turns.

type Granularity = 'day' | 'week' | 'month';

const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTH_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 1000) / 10 : 0);

/** Day buckets up to a month, weeks (Monday first) up to ~4 months, months beyond. */
export function granularityFor(from: string, to: string): Granularity {
  const days = getDateRange(from, to).length;
  return days <= 31 ? 'day' : days <= 120 ? 'week' : 'month';
}

export function bucketOf(date: string, granularity: Granularity): { key: string; label: string } {
  const { day, month, year, dayOfWeek } = parseDateString(date);
  if (granularity === 'day') return { key: date, label: `${DAY_SHORT[dayOfWeek]} ${day}` };
  if (granularity === 'month') return { key: date.slice(0, 7), label: `${MONTH_SHORT[month - 1]} ${String(year).slice(2)}` };
  const monday = addDays(date, dayOfWeek === 0 ? -6 : 1 - dayOfWeek);
  const m = parseDateString(monday);
  return { key: monday, label: `${m.day} ${MONTH_SHORT[m.month - 1]}` };
}

/** Phone numbers typed differently ("291 456-7890", "+54 9 291 4567890") group together by their last 10 digits. */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export async function getComplexAnalytics(complexId: string, from: string, toParam: string) {
  // Occupancy and revenue up to today: future days are still filling up.
  const todayStr = today();
  const to = toParam > todayStr ? todayStr : toParam;
  const granularity = granularityFor(from, to < from ? from : to);

  const courts = await prisma.court.findMany({ where: { complexId }, orderBy: { order: 'asc' } });
  const turns =
    to < from
      ? []
      : await prisma.turn.findMany({
          where: { court: { complexId }, date: { gte: from, lte: to } },
          select: {
            courtId: true,
            date: true,
            startTime: true,
            state: true,
            price: true,
            reservation: {
              select: { id: true, type: true, fixedBookingId: true, guestName: true, guestPhone: true, createdAt: true },
            },
          },
        });

  const reservationIds = turns.flatMap((t) => (t.reservation ? [t.reservation.id] : []));
  const paymentMap = buildPaymentMap(await getPaymentsByPayableIds('RESERVATION', reservationIds));

  // ── Capacity: bookable turns per court and day ─────────────────────────
  const turnsByCourtDay = new Map<string, typeof turns>();
  for (const t of turns) {
    const key = `${t.courtId}_${t.date}`;
    const list = turnsByCourtDay.get(key);
    if (list) list.push(t);
    else turnsByCourtDay.set(key, [t]);
  }

  type Cell = { capacity: number; occupied: number };
  const heat = new Map<string, Cell>(); // `${dayOfWeek}_${hour}`
  const series = new Map<string, { key: string; label: string; capacity: number; occupied: number; revenue: number; collected: number; reservations: number }>();
  const byCourt = new Map<string, { courtId: string; name: string; capacity: number; occupied: number; revenue: number }>();
  const bump = (map: Map<string, Cell>, key: string, capacity: number, occupied: number) => {
    const c = map.get(key) ?? { capacity: 0, occupied: 0 };
    c.capacity += capacity;
    c.occupied += occupied;
    map.set(key, c);
  };
  const seriesBucket = (date: string) => {
    const b = bucketOf(date, granularity);
    let s = series.get(b.key);
    if (!s) {
      s = { ...b, capacity: 0, occupied: 0, revenue: 0, collected: 0, reservations: 0 };
      series.set(b.key, s);
    }
    return s;
  };

  // Every bucket of the range shows up, even with no activity.
  const dates = to < from ? [] : getDateRange(from, to);
  for (const date of dates) seriesBucket(date);

  let billed = 0;
  let collected = 0;
  let reservationsCount = 0;
  const byType = {
    oneOff: { count: 0, revenue: 0 },
    fixed: { count: 0, revenue: 0 },
    classes: { count: 0, revenue: 0 },
  };
  const clients = new Map<string, { name: string; phone: string; lastDate: string; reservations: number; spent: number; owed: number }>();

  for (const court of courts) {
    byCourt.set(court.id, { courtId: court.id, name: court.name, capacity: 0, occupied: 0, revenue: 0 });
  }

  for (const date of dates) {
    const { dayOfWeek } = parseDateString(date);
    const bucket = seriesBucket(date);
    for (const court of courts) {
      const dayTurns = turnsByCourtDay.get(`${court.id}_${date}`);
      const courtStats = byCourt.get(court.id)!;

      if (!dayTurns) {
        // A day nobody looked at was never generated: its capacity is the
        // court's range (only for courts still in use).
        if (!court.active) continue;
        for (const slot of buildCourtSlots(court)) {
          bump(heat, `${dayOfWeek}_${slot.start.slice(0, 2)}`, 1, 0);
          bucket.capacity += 1;
          courtStats.capacity += 1;
        }
        continue;
      }

      for (const t of dayTurns) {
        const r = t.reservation;
        // Blocked turns, closures and tournaments aren't bookable capacity.
        const bookable = t.state === 'AVAILABLE' || t.state === 'OCCUPIED' || Boolean(r);
        if (!bookable) continue;
        const occupied = r ? 1 : 0;
        bump(heat, `${dayOfWeek}_${t.startTime.slice(0, 2)}`, 1, occupied);
        bucket.capacity += 1;
        bucket.occupied += occupied;
        courtStats.capacity += 1;
        courtStats.occupied += occupied;
        if (!r) continue;

        const p = paymentMap.get(r.id);
        const amount = p ? p.amount : t.price;
        const paid = p?.status === 'PAID';
        billed += amount;
        if (paid) collected += amount;
        reservationsCount += 1;
        bucket.revenue += amount;
        if (paid) bucket.collected += amount;
        bucket.reservations += 1;
        courtStats.revenue += amount;

        const type = r.type === 'CLASS' ? byType.classes : r.fixedBookingId ? byType.fixed : byType.oneOff;
        type.count += 1;
        type.revenue += amount;

        if (r.type === 'PLAYER') {
          const phoneKey = normalizePhone(r.guestPhone) || r.guestName.toLowerCase();
          const c = clients.get(phoneKey) ?? { name: r.guestName, phone: r.guestPhone, lastDate: '', reservations: 0, spent: 0, owed: 0 };
          c.reservations += 1;
          if (paid) c.spent += amount;
          else c.owed += amount;
          if (t.date >= c.lastDate) {
            c.lastDate = t.date;
            c.name = r.guestName;
            c.phone = r.guestPhone;
          }
          clients.set(phoneKey, c);
        }
      }
    }
  }

  const totalCapacity = [...byCourt.values()].reduce((s, c) => s + c.capacity, 0);
  const totalOccupied = [...byCourt.values()].reduce((s, c) => s + c.occupied, 0);

  // ── Cancellations (logged when a reservation is cancelled) ─────────────
  const cancellations = await prisma.reservationCancellation.findMany({
    where: { complexId, date: { gte: from, lte: toParam } },
    select: { minutesBefore: true, cancelledBy: true, price: true },
  });
  const byLead = { under24h: 0, from24to48h: 0, over48h: 0 };
  const byWho = { PLAYER: 0, OWNER: 0, PROFESSOR: 0 };
  for (const c of cancellations) {
    if (c.minutesBefore < 24 * 60) byLead.under24h += 1;
    else if (c.minutesBefore < 48 * 60) byLead.from24to48h += 1;
    else byLead.over48h += 1;
    byWho[c.cancelledBy] += 1;
  }

  const hours = [...new Set([...heat.keys()].map((k) => k.split('_')[1]))].sort();

  return {
    range: { from, to: toParam, effectiveTo: to, granularity },
    kpis: {
      occupancyPct: pct(totalOccupied, totalCapacity),
      occupiedTurns: totalOccupied,
      capacity: totalCapacity,
      billed,
      collected,
      pending: billed - collected,
      reservations: reservationsCount,
      avgTicket: reservationsCount > 0 ? Math.round(billed / reservationsCount) : 0,
      cancellations: cancellations.length,
      lateCancellations: byLead.under24h,
    },
    series: [...series.values()]
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((s) => ({
        key: s.key,
        label: s.label,
        revenue: s.revenue,
        collected: s.collected,
        reservations: s.reservations,
        occupancyPct: pct(s.occupied, s.capacity),
      })),
    byType,
    heatmap: {
      hours,
      // Monday first, like the app's week views.
      days: [1, 2, 3, 4, 5, 6, 0].map((dow) => ({
        dayOfWeek: dow,
        label: DAY_SHORT[dow],
        cells: hours.map((h) => {
          const c = heat.get(`${dow}_${h}`);
          return { hour: h, capacity: c?.capacity ?? 0, occupied: c?.occupied ?? 0, pct: c ? pct(c.occupied, c.capacity) : null };
        }),
      })),
    },
    byCourt: [...byCourt.values()]
      .filter((c) => c.capacity > 0 || c.revenue > 0)
      .map((c) => ({ ...c, occupancyPct: pct(c.occupied, c.capacity) })),
    topClients: [...clients.values()]
      .sort((a, b) => b.reservations - a.reservations || b.spent + b.owed - (a.spent + a.owed))
      .slice(0, 10),
    cancellations: { total: cancellations.length, byLead, byWho },
  };
}

// ── Professor analytics ──────────────────────────────────────────────────

/**
 * A professor's numbers for a date range, built on the same billing rules as
 * the student accounts (`computeBalances`): billed = classes given and
 * charged, collected = payments recorded, court cost = the price of the
 * turns their classes used (what the complex charges them).
 */
export async function getProfessorAnalytics(professorId: string, from: string, to: string) {
  // Classes repeat weekly, so days would mostly be empty bars: weeks up to
  // ~4 months, months beyond.
  const granularity: Granularity = getDateRange(from, to).length <= 120 ? 'week' : 'month';
  const inRange = (date: string) => date >= from && date <= to;
  const now = nowParts();

  const { balances, charges, absentClasses, payments } = await computeBalances(professorId);

  const schedules = await prisma.classSchedule.findMany({
    where: { professorId },
    include: { court: true, complex: { select: { id: true, name: true } } },
  });
  const scheduleById = new Map(schedules.map((s) => [s.id, s]));
  const enrollments = await prisma.classEnrollment.findMany({
    where: { student: { professorId } },
    select: { id: true, classScheduleId: true, studentId: true, dayOfWeek: true, startTime: true, startDate: true, endDate: true },
  });
  const enrollmentById = new Map(enrollments.map((e) => [e.id, e]));
  const students = await prisma.student.findMany({ where: { professorId }, select: { id: true, name: true, phone: true } });
  const studentById = new Map(students.map((s) => [s.id, s]));

  const given = (
    await prisma.reservation.findMany({
      where: { classScheduleId: { in: schedules.map((s) => s.id) }, turn: { date: { gte: from, lte: to } } },
      select: { classScheduleId: true, turn: { select: { date: true, startTime: true, price: true } } },
    })
  ).filter((r) => hasStarted(r.turn.date, r.turn.startTime, now));

  // ── Series ─────────────────────────────────────────────────────────────
  const series = new Map<string, { key: string; label: string; billed: number; collected: number; courtCost: number; classesGiven: number }>();
  const bucket = (date: string) => {
    const b = bucketOf(date, granularity);
    let s = series.get(b.key);
    if (!s) {
      s = { ...b, billed: 0, collected: 0, courtCost: 0, classesGiven: 0 };
      series.set(b.key, s);
    }
    return s;
  };
  for (const date of getDateRange(from, to)) bucket(date);

  const byComplex = new Map<string, { complexId: string; name: string; classesGiven: number; billed: number; courtCost: number }>();
  const complexStats = (scheduleId: string | null | undefined) => {
    const s = scheduleId ? scheduleById.get(scheduleId) : undefined;
    if (!s) return null;
    let c = byComplex.get(s.complexId);
    if (!c) {
      c = { complexId: s.complexId, name: s.complex.name, classesGiven: 0, billed: 0, courtCost: 0 };
      byComplex.set(s.complexId, c);
    }
    return c;
  };

  let billed = 0;
  for (const c of charges) {
    if (!inRange(c.date)) continue;
    billed += c.price;
    bucket(c.date).billed += c.price;
    const cs = complexStats(enrollmentById.get(c.enrollmentId)?.classScheduleId);
    if (cs) cs.billed += c.price;
  }

  let collected = 0;
  for (const p of payments) {
    if (!inRange(p.date)) continue;
    collected += p.amount;
    bucket(p.date).collected += p.amount;
  }

  let courtCost = 0;
  for (const r of given) {
    courtCost += r.turn.price;
    const b = bucket(r.turn.date);
    b.courtCost += r.turn.price;
    b.classesGiven += 1;
    const cs = complexStats(r.classScheduleId);
    if (cs) {
      cs.classesGiven += 1;
      cs.courtCost += r.turn.price;
    }
  }

  // ── Attendance: charged classes vs. absences in the range ─────────────
  const attendance = new Map<string, { attended: number; missed: number }>();
  const tally = (studentId: string, field: 'attended' | 'missed') => {
    const a = attendance.get(studentId) ?? { attended: 0, missed: 0 };
    a[field] += 1;
    attendance.set(studentId, a);
  };
  for (const c of charges) if (inRange(c.date)) tally(c.studentId, 'attended');
  for (const c of absentClasses) if (inRange(c.date)) tally(c.studentId, 'missed');
  const totalAttended = [...attendance.values()].reduce((s, a) => s + a.attended, 0);
  const totalMissed = [...attendance.values()].reduce((s, a) => s + a.missed, 0);

  // ── Current occupancy of the weekly classes (max 4 students each) ─────
  const openEnrollments = enrollments.filter((e) => e.endDate === null);
  const weeklyClasses = schedules
    .filter((s) => s.active)
    .flatMap((s) =>
      s.daysOfWeek.flatMap((dayOfWeek) =>
        slotsWithin(s.court, s.startTime, s.endTime).map((slot) => {
          const enrolled = openEnrollments.filter(
            (e) => e.classScheduleId === s.id && e.dayOfWeek === dayOfWeek && e.startTime === slot.start
          ).length;
          return {
            complexName: s.complex.name,
            courtName: s.court.name,
            dayOfWeek,
            dayLabel: DAY_SHORT[dayOfWeek],
            startTime: slot.start,
            enrolled,
            free: MAX_STUDENTS_PER_CLASS - enrolled,
          };
        })
      )
    )
    // Monday first.
    .sort((a, b) => ((a.dayOfWeek + 6) % 7) - ((b.dayOfWeek + 6) % 7) || a.startTime.localeCompare(b.startTime));
  const seats = weeklyClasses.length * MAX_STUDENTS_PER_CLASS;
  const taken = weeklyClasses.reduce((s, c) => s + c.enrolled, 0);

  // ── Students: debt, joins and leaves ──────────────────────────────────
  const owing = [...balances.entries()].filter(([, b]) => b.balance < 0);
  const newStudents = new Set(enrollments.filter((e) => inRange(e.startDate)).map((e) => e.studentId));
  // A student left when an enrollment closed in the range and they have no open one anymore.
  const stillEnrolled = new Set(openEnrollments.map((e) => e.studentId));
  const leftStudents = new Set(
    enrollments.filter((e) => e.endDate && inRange(e.endDate) && !stillEnrolled.has(e.studentId)).map((e) => e.studentId)
  );

  return {
    range: { from, to, granularity },
    kpis: {
      billed,
      collected,
      courtCost,
      margin: billed - courtCost,
      classesGiven: given.length,
      attendancePct: pct(totalAttended, totalAttended + totalMissed),
      debtTotal: owing.reduce((s, [, b]) => s - b.balance, 0),
      studentsOwing: owing.length,
      activeStudents: stillEnrolled.size,
      newStudents: newStudents.size,
      leftStudents: leftStudents.size,
      occupancyPct: pct(taken, seats),
      freeSeats: seats - taken,
    },
    series: [...series.values()].sort((a, b) => a.key.localeCompare(b.key)),
    byComplex: [...byComplex.values()].sort((a, b) => b.classesGiven - a.classesGiven),
    attendance: [...attendance.entries()]
      .map(([studentId, a]) => ({
        studentId,
        name: studentById.get(studentId)?.name ?? 'Alumno',
        attended: a.attended,
        missed: a.missed,
        pct: pct(a.attended, a.attended + a.missed),
      }))
      .sort((a, b) => a.pct - b.pct || b.missed - a.missed),
    classesWithRoom: weeklyClasses.filter((c) => c.free > 0),
    debtors: owing
      .map(([studentId, b]) => ({
        studentId,
        name: studentById.get(studentId)?.name ?? 'Alumno',
        phone: studentById.get(studentId)?.phone ?? '',
        owes: -b.balance,
      }))
      .sort((a, b) => b.owes - a.owes)
      .slice(0, 10),
  };
}
