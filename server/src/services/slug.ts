import prisma from '../prisma';

// A complex's public page lives at the site root (tuturnito.com/<slug>), so
// slugs can't collide with the app's own top-level routes.
export const RESERVED_SLUGS = new Set([
  'api',
  'auth',
  'owner',
  'professor',
  'profile',
  'my-reservations',
  'partidos',
  'complexes',
  'admin',
  'login',
  'register',
  'dashboard',
  'settings',
  'assets',
  'static',
  'favicon-ico',
  'robots-txt',
]);

export const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const SLUG_MIN = 3;
export const SLUG_MAX = 60;

/** "Pádel Master Club Bahía" -> "padel-master-club-bahia". */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, '');
}

/** Why a slug the owner typed can't be used, or null if it's valid (uniqueness is checked separately). */
export function slugFormatError(slug: string): string | null {
  if (slug.length < SLUG_MIN || slug.length > SLUG_MAX) {
    return `La dirección debe tener entre ${SLUG_MIN} y ${SLUG_MAX} caracteres.`;
  }
  if (!SLUG_REGEX.test(slug)) {
    return 'La dirección solo puede tener minúsculas, números y guiones (sin espacios ni tildes).';
  }
  if (RESERVED_SLUGS.has(slug)) {
    return 'Esa dirección está reservada por la plataforma. Elegí otra.';
  }
  return null;
}

export async function isSlugTaken(slug: string, excludeComplexId?: string): Promise<boolean> {
  const existing = await prisma.complex.findUnique({ where: { slug }, select: { id: true } });
  return Boolean(existing && existing.id !== excludeComplexId);
}

/** A free slug derived from the complex name: "padel-club", then "padel-club-2", "padel-club-3"... */
export async function generateUniqueSlug(name: string): Promise<string> {
  let base = slugify(name);
  if (base.length < SLUG_MIN) base = base ? `complejo-${base}` : 'complejo';
  if (RESERVED_SLUGS.has(base)) base = `${base}-club`;

  let candidate = base;
  for (let n = 2; await isSlugTaken(candidate); n++) {
    candidate = `${base}-${n}`;
  }
  return candidate;
}
