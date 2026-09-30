import prisma from '../prisma';
import { NowParts, minutesUntil, nowParts } from '../services/clock';
import { addDays } from '../services/schedule.service';
import { cancelDeadline } from '../services/reservation.service';
import { reminderEmail } from '../services/emails';
import { sendMails, MailMessage } from '../services/mailer';

const REMIND_WITHIN_MINUTES = 24 * 60;
// A turn booked shortly before it starts doesn't need a reminder.
const MIN_BOOKING_LEAD_MINUTES = 2 * 60;
const SWEEP_EVERY_MS = 10 * 60 * 1000;

/**
 * Emails a reminder for every player booking that starts within the next
 * 24 h and hasn't been reminded yet. Each reservation is claimed (guarded
 * update on `reminderSentAt: null`) before sending, so overlapping sweeps or
 * several server instances never send it twice. Returns how many were sent.
 */
export async function runReminderSweep(now: NowParts = nowParts()): Promise<number> {
  const candidates = await prisma.reservation.findMany({
    where: {
      type: 'PLAYER',
      reminderSentAt: null,
      turn: { date: { gte: now.today, lte: addDays(now.today, 1) } },
    },
    include: {
      turn: { include: { court: true } },
      complex: true,
      user: { select: { name: true, email: true, emailReminders: true } },
      openMatch: { include: { players: { include: { user: { select: { name: true, email: true, emailReminders: true } } } } } },
    },
  });

  let sent = 0;
  for (const r of candidates) {
    const minutesLeft = minutesUntil(r.turn.date, r.turn.startTime, now);
    if (minutesLeft <= 0 || minutesLeft > REMIND_WITHIN_MINUTES) continue;
    const leadMinutes = (Date.now() - r.createdAt.getTime()) / 60000 + minutesLeft;
    if (leadMinutes < MIN_BOOKING_LEAD_MINUTES) continue;

    const recipients: { email: string; name: string }[] = [];
    if (r.user) {
      if (r.user.emailReminders) recipients.push({ email: r.user.email, name: r.user.name });
    } else if (r.guestEmail) {
      recipients.push({ email: r.guestEmail, name: r.guestName });
    }
    for (const p of r.openMatch?.players ?? []) {
      if (p.user.emailReminders) recipients.push({ email: p.user.email, name: p.user.name });
    }
    if (recipients.length === 0) continue;

    const claimed = await prisma.reservation.updateMany({ where: { id: r.id, reminderSentAt: null }, data: { reminderSentAt: new Date() } });
    if (claimed.count === 0) continue;

    const turn = {
      complexName: r.complex.name,
      complexAddress: r.complex.address,
      complexPhone: r.complex.phone,
      courtName: r.turn.court.name,
      date: r.turn.date,
      startTime: r.turn.startTime,
      endTime: r.turn.endTime,
      price: r.turn.price,
    };
    const deadline = cancelDeadline(r.turn, r.complex.cancellationHours);
    const canCancel = minutesUntil(deadline.today, deadline.time, now) > 0;
    const messages: MailMessage[] = recipients.map((to) =>
      reminderEmail(to.email, to.name, turn, { deadline: { date: deadline.today, time: deadline.time }, canCancel })
    );
    await sendMails(messages);
    sent += 1;
  }
  return sent;
}

/** Runs the reminder sweep every 10 minutes (started by index.ts outside tests). */
export function startReminderJob() {
  const tick = () => {
    runReminderSweep().catch((error) => console.error('Error en el envío de recordatorios:', error));
  };
  tick();
  return setInterval(tick, SWEEP_EVERY_MS);
}
