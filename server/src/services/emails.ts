import { MailMessage } from './mailer';

// Email templates. Plain inline-styled HTML (email clients ignore <style>
// blocks) plus a text version for clients that don't render HTML.

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** "miércoles 1 de octubre" */
export function longDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DAY_NAMES[dow]} ${d} de ${MONTH_NAMES[m - 1]}`;
}

const money = (n: number) => `$${n.toLocaleString('es-AR')}`;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function layout(title: string, rows: string[], cta?: { label: string; url: string }, footer?: string): string {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f3f5f9;font-family:Arial,Helvetica,sans-serif;color:#1d2330">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px">
<div style="font-weight:800;font-size:18px;color:#3a7af0;margin-bottom:16px">TuTurnito</div>
<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(title)}</h1>
${rows.map((r) => `<p style="margin:0 0 10px;font-size:15px;line-height:1.5">${r}</p>`).join('\n')}
${cta ? `<p style="margin:22px 0 8px"><a href="${cta.url}" style="background:#3a7af0;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700;display:inline-block">${escapeHtml(cta.label)}</a></p>` : ''}
${footer ? `<p style="margin:22px 0 0;font-size:12px;color:#7a8499">${footer}</p>` : ''}
</div></body></html>`;
}

const stripTags = (s: string) => s.replace(/<[^>]+>/g, '');

export interface TurnInfo {
  complexName: string;
  complexAddress: string;
  complexPhone: string | null;
  courtName: string;
  date: string;
  startTime: string;
  endTime: string;
  price: number;
}

/** Reminder sent ~24 h before a turn to whoever booked it (and the players who joined its open match). */
export function reminderEmail(
  to: string,
  name: string,
  turn: TurnInfo,
  cancel: { deadline: { date: string; time: string } | null; canCancel: boolean }
): MailMessage {
  const when = `${longDate(turn.date)} de ${turn.startTime} a ${turn.endTime} hs`;
  const rows = [
    `Hola ${escapeHtml(name)}, te recordamos tu turno:`,
    `<strong>${escapeHtml(turn.complexName)}</strong> · ${escapeHtml(turn.courtName)}<br>${when}<br>${escapeHtml(turn.complexAddress)}`,
    `Precio del turno: <strong>${money(turn.price)}</strong> (se paga en el complejo).`,
    cancel.canCancel && cancel.deadline
      ? `Si no podés ir, cancelalo desde la app hasta el ${longDate(cancel.deadline.date)} a las ${cancel.deadline.time} hs para liberar la cancha.`
      : turn.complexPhone
        ? `Si no podés ir, avisale al complejo al ${escapeHtml(turn.complexPhone)}.`
        : 'Si no podés ir, avisale al complejo.',
  ];
  const html = layout(
    `Mañana jugás en ${turn.complexName}`,
    rows,
    { label: 'Ver mis reservas', url: `${CLIENT_URL}/my-reservations` },
    'Recibís este email porque tenés los recordatorios activados. Podés desactivarlos desde tu perfil.'
  );
  return { to, subject: `Recordatorio: ${turn.startTime} hs en ${turn.complexName} (${longDate(turn.date)})`, html, text: rows.map(stripTags).join('\n') };
}

export type OpenMatchEvent = 'JOINED' | 'LEFT' | 'REMOVED' | 'CLOSED' | 'CANCELLED';

/** Open-match notices: to the organizer when someone joins/leaves, to the players when they're removed or the match is closed/cancelled. */
export function openMatchEmail(to: string, name: string, event: OpenMatchEvent, turn: TurnInfo, extra: { playerName?: string; spotsLeft?: number }): MailMessage {
  const when = `${longDate(turn.date)} a las ${turn.startTime} hs`;
  const where = `${turn.complexName} · ${turn.courtName}`;
  const copy: Record<OpenMatchEvent, { subject: string; title: string; body: string }> = {
    JOINED: {
      subject: `${extra.playerName} se sumó a tu partido del ${longDate(turn.date)}`,
      title: `${extra.playerName} se sumó a tu partido`,
      body:
        extra.spotsLeft === 0
          ? `Ya están completos para el ${when} en ${where}. ¡A jugar!`
          : `Tu partido del ${when} en ${where} tiene ${extra.spotsLeft} lugar${extra.spotsLeft === 1 ? '' : 'es'} libre${extra.spotsLeft === 1 ? '' : 's'}.`,
    },
    LEFT: {
      subject: `${extra.playerName} se bajó de tu partido del ${longDate(turn.date)}`,
      title: `${extra.playerName} se bajó de tu partido`,
      body: `Se liberó un lugar en tu partido del ${when} en ${where}. Sigue publicado para que se sume otro jugador.`,
    },
    REMOVED: {
      subject: `Ya no estás en el partido del ${longDate(turn.date)}`,
      title: 'El organizador te sacó del partido',
      body: `El organizador del partido del ${when} en ${where} te quitó de la lista de jugadores.`,
    },
    CLOSED: {
      subject: `El partido del ${longDate(turn.date)} ya no busca jugadores`,
      title: 'El organizador cerró el partido abierto',
      body: `El partido del ${when} en ${where} dejó de estar publicado. Si ibas a jugar, confirmalo con el organizador.`,
    },
    CANCELLED: {
      subject: `Se canceló el partido del ${longDate(turn.date)}`,
      title: 'El partido se canceló',
      body: `La reserva del ${when} en ${where} se canceló, así que el partido no se juega.`,
    },
  };
  const c = copy[event];
  const rows = [`Hola ${escapeHtml(name)},`, escapeHtml(c.body)];
  const html = layout(c.title, rows, { label: 'Ver mis reservas', url: `${CLIENT_URL}/my-reservations` });
  return { to, subject: c.subject, html, text: rows.map(stripTags).join('\n') };
}
