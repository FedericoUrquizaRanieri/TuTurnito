// Curated padel court stock photos (Unsplash) used as placeholders until
// complexes upload real photography. Picked deterministically per complex
// so the same complex always shows the same image across reloads.
const PHOTO_IDS = [
  '1689942963385-f5bd03f3b270',
  '1658723826297-fe4d1b1e6600',
  '1657704358775-ed705c7388d2',
  '1658491830143-72808ca237e3',
  '1673266893352-6de89e258064',
  '1767128890954-20ce481be8f0',
];

export const HERO_PHOTO_ID = '1689942963385-f5bd03f3b270';

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function photoUrl(id: string, width: number): string {
  return `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${width}&q=80`;
}

/** Deterministic single placeholder photo for a given complex id. */
export function getComplexPhoto(complexId: string, width = 800): string {
  const index = hashString(complexId) % PHOTO_IDS.length;
  return photoUrl(PHOTO_IDS[index], width);
}

/** Deterministic set of `count` distinct placeholder photos for a gallery. */
export function getComplexGallery(complexId: string, count = 3, width = 900): string[] {
  const start = hashString(complexId) % PHOTO_IDS.length;
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    ids.push(PHOTO_IDS[(start + i) % PHOTO_IDS.length]);
  }
  return ids.map((id) => photoUrl(id, width));
}
