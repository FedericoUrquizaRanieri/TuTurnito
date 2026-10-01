/** Contact for complexes that want to join: owner accounts aren't open for sign-up. */
export const CONTACT_EMAIL = import.meta.env.VITE_CONTACT_EMAIL || '';

export const joinComplexMailto = CONTACT_EMAIL
  ? `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Quiero sumar mi complejo a TuTurnito')}`
  : '';
