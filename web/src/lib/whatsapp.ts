/**
 * wa.me link for an Argentine phone number as people type it ("291 456-7890",
 * "+54 9 291 4567890"). Local numbers get the country (54) and mobile (9) prefix.
 */
export function whatsappLink(phone: string, text?: string): string {
  let digits = phone.replace(/\D/g, '').replace(/^0+/, '');
  if (!digits.startsWith('54')) digits = `549${digits}`;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

/** Whether a typed phone has enough digits to open a WhatsApp chat. */
export function canWhatsapp(phone: string | null | undefined): phone is string {
  return Boolean(phone && phone.replace(/\D/g, '').length >= 6);
}
