import nodemailer, { Transporter } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

// Emails "sent" while testing, so tests can assert on them instead of
// talking to a real SMTP server.
export const outbox: MailMessage[] = [];

const SMTP_HOST = process.env.SMTP_HOST;
export const MAIL_FROM = process.env.MAIL_FROM || 'TuTurnito <no-reply@tuturnito.com>';

let transporter: Transporter | null = null;
function getTransporter(): Transporter | null {
  if (!SMTP_HOST) return null;
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 587);
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

/**
 * Sends an email. In tests it's kept in `outbox`; without SMTP configured
 * (local development) it's printed to the console. A failure is logged and
 * returns false instead of throwing: an email must never break the action
 * that triggered it.
 */
export async function sendMail(message: MailMessage): Promise<boolean> {
  if (process.env.NODE_ENV === 'test') {
    outbox.push(message);
    return true;
  }
  const t = getTransporter();
  if (!t) {
    console.log(`📧 [email sin SMTP] Para: ${message.to} · ${message.subject}\n${message.text}\n`);
    return true;
  }
  try {
    await t.sendMail({ from: MAIL_FROM, ...message });
    return true;
  } catch (error) {
    console.error(`No se pudo enviar el email a ${message.to}:`, error);
    return false;
  }
}

/** Sends several emails without waiting on each other; never throws. */
export async function sendMails(messages: MailMessage[]): Promise<void> {
  await Promise.all(messages.map((m) => sendMail(m)));
}
