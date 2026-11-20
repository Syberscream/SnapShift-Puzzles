// Etsy printable wall art: the five frame shapes we make, Etsy's limits, and the
// parts of every listing description that are the same for each picture.

export interface PrintSize {
  /** Used in file names. */
  id: string;
  label: string;
  /** Largest print at 300 DPI. */
  w: number;
  h: number;
  /** The print sizes this file covers (shown on the sizes photo and in the description). */
  sizes: string[];
}

/** Landscape files (wider than tall); a portrait picture gets the same sizes turned sideways. */
export const PRINT_SIZES: PrintSize[] = [
  { id: '3x2-ratio_up-to-48x32in', label: '3:2', w: 14400, h: 9600, sizes: ['6x4 · 12x8 · 18x12 · 24x16', '30x20 · 36x24 · 48x32 in', '15x10 · 60x40 · 90x60 · 120x80 cm'] },
  { id: '4x3-ratio_up-to-32x24in', label: '4:3', w: 9600, h: 7200, sizes: ['8x6 · 12x9 · 16x12', '20x15 · 24x18 · 32x24 in'] },
  { id: '5x4-ratio_up-to-30x24in', label: '5:4', w: 9000, h: 7200, sizes: ['10x8 · 15x12 · 20x16', '25x20 · 30x24 in', '50x40 · 75x60 cm'] },
  { id: '14x11-ratio_up-to-28x22in', label: '11:14', w: 8400, h: 6600, sizes: ['14x11 · 28x22 in'] },
  { id: 'ISO-A-sizes_up-to-A0', label: 'ISO', w: 14043, h: 9933, sizes: ['A5 · A4 · A3 · A2 · A1 · A0'] },
];

/** Etsy's limits for a digital listing. */
export const ETSY = { titleMax: 140, tags: 13, tagMax: 20, fileMaxBytes: 20 * 1024 * 1024, files: 5, photos: 10 };

export type EtsyStatus = 'none' | 'prepared' | 'listed';

/** Up to this many starred default mockups for each frame shape. */
export const MAX_MOCKUPS = ETSY.photos - 3;

export type FrameShape = 'portrait' | 'landscape' | 'square';

/** Which way up a mockup's marked frame is, from its four corners (fractions of the photo). */
export function frameShape(corners: [number, number][] | null | undefined, width: number, height: number): FrameShape | null {
  if (!corners || corners.length !== 4) return null;
  const q = corners.map(([u, v]) => [u * width, v * height]);
  const side = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const w = (side(q[0], q[1]) + side(q[3], q[2])) / 2;
  const h = (side(q[0], q[3]) + side(q[1], q[2])) / 2;
  return h > w * 1.08 ? 'portrait' : w > h * 1.08 ? 'landscape' : 'square';
}

export function sizesBlock(portrait: boolean): string {
  const t = (s: string) => (portrait ? s.replace(/(\d+)x(\d+)/g, '$2x$1') : s);
  return [
    'WHAT YOU GET',
    'Five high-resolution JPG files at 300 DPI, one for each standard frame shape. Each file prints sharp at every size on its line:',
    '',
    `• 3:2 ratio: ${t('6x4, 12x8, 18x12, 24x16, 30x20, 36x24, 48x32 in')} (also ${t('15x10, 45x30, 60x40, 90x60, 120x80 cm')})`,
    `• 4:3 ratio: ${t('8x6, 12x9, 16x12, 20x15, 24x18, 32x24 in')}`,
    `• 5:4 ratio: ${t('10x8, 15x12, 20x16, 25x20, 30x24 in')} (also ${t('50x40, 75x60 cm')})`,
    `• 11:14 ratio: ${t('14x11, 28x22 in')}`,
    '• ISO A sizes: A5, A4, A3, A2, A1, A0',
    '',
    portrait ? 'All sizes are portrait (taller than wide).' : 'All sizes are landscape (wider than tall).',
  ].join('\n');
}

export const HOW_BLOCK = `HOW IT WORKS
1. Buy the listing, then download your files from your Etsy account (Purchases and reviews).
2. Print at home, at a local print shop, or with an online print service.
3. Frame and enjoy.

Tip: for the best colour, print on matte or lustre photo paper. Colours can look a little different from one screen or printer to another.

PLEASE NOTE
• This is a DIGITAL DOWNLOAD. Nothing physical is shipped, and no frame is included.
• For personal use only. Please don't resell or share the files.
• Because it's a digital file, I can't offer returns, but message me if anything goes wrong with your download and I'll make it right.`;

export const AI_BLOCK = 'ABOUT THIS ART\nI created this artwork using AI image tools, then selected, refined and upscaled it for printing.';

/** The full description: the picture's own intro, then the shared parts. */
export const fullDescription = (intro: string, portrait = false) => [intro.trim(), sizesBlock(portrait), HOW_BLOCK, AI_BLOCK].join('\n\n');

/** Tidy tags to Etsy's rules: lower case, letters/numbers/spaces, at most 20 characters, no repeats. */
export function cleanTags(tags: unknown): string[] {
  const out: string[] = [];
  for (const t of Array.isArray(tags) ? tags : String(tags ?? '').split(',')) {
    const s = String(t)
      .toLowerCase()
      .replace(/[^a-z0-9 '&-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!s) continue;
    const cut = s.length > ETSY.tagMax ? s.slice(0, ETSY.tagMax).replace(/\s+\S*$/, '') : s;
    if (cut && !out.includes(cut)) out.push(cut);
    if (out.length === ETSY.tags) break;
  }
  return out;
}

/** A simple first draft from the puzzle's own details, used until the AI writes one. */
export function draftListing(p: { title: string; description?: string; category?: string | null }): { title: string; intro: string; tags: string[] } {
  const name = p.title.trim();
  const cat = (p.category ?? '').trim();
  const title = `${name} Wall Art Print${cat ? `, ${cat} Decor` : ''}, Printable Art, High Resolution Digital Download`.slice(0, ETSY.titleMax);
  const intro = `${p.description?.trim() || `${name}, a richly detailed piece ready to print and frame.`}\n\nA lovely piece for a living room, bedroom or office, and an easy last-minute gift.`;
  const words = name.toLowerCase();
  const tags = cleanTags([`${words} print`, `${words} art`, cat && `${cat} wall art`, cat && `${cat} print`, 'printable wall art', 'digital download', 'wall art print', 'home decor', 'gift idea', 'large wall art', 'living room art', 'printable art', 'art print']);
  return { title, intro, tags };
}
