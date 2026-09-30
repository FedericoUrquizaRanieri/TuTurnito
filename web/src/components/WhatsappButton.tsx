import React from 'react';
import { MessageCircle } from 'lucide-react';
import { canWhatsapp, whatsappLink } from '../lib/whatsapp';

interface WhatsappButtonProps {
  phone: string | null | undefined;
  /** Prefilled message. */
  text?: string;
  /** Text next to the icon; icon-only when omitted. */
  label?: string;
  title?: string;
}

/** Opens a WhatsApp chat with the number (nothing when it isn't a usable phone). */
export const WhatsappButton: React.FC<WhatsappButtonProps> = ({ phone, text, label, title }) => {
  if (!canWhatsapp(phone)) return null;
  return (
    <a
      className="btn btn-secondary btn-sm"
      href={whatsappLink(phone, text)}
      target="_blank"
      rel="noreferrer"
      title={title ?? 'Escribir por WhatsApp'}
      aria-label={title ?? 'Escribir por WhatsApp'}
      style={label ? undefined : { padding: '0.25rem 0.5rem' }}
    >
      <MessageCircle size={label ? 14 : 13} />
      {label && <span>{label}</span>}
    </a>
  );
};
