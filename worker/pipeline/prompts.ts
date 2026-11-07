// Prompt ideas per category. The generator combines a subject with a setting and
// a style so each run produces something different; titles come from the subject.
// Edit freely: add subjects, or add a "prompt hint" to a category in the admin.

export interface PromptIdea {
  title: string;
  prompt: string;
}

const SUBJECTS: Record<string, string[]> = {
  animals: [
    'Red Fox', 'Snow Leopard', 'Bengal Tiger', 'Barn Owl', 'Mountain Goat', 'Hummingbird', 'Sea Otter', 'Grey Wolf',
    'Peacock', 'Elephant Herd', 'Arctic Hare', 'Toucan', 'Lion Pride', 'Koala', 'Kingfisher', 'Bison',
  ],
  landscapes: [
    'Alpine Lake', 'Desert Canyon', 'Misty Valley', 'Autumn Forest', 'Glacier Bay', 'Lavender Fields', 'Rolling Hills',
    'Volcanic Coast', 'Northern Lights', 'Bamboo Grove', 'Waterfall Gorge', 'Tea Terraces', 'Salt Flats', 'Fjord',
  ],
  nature: [
    'Dew on Ferns', 'Wild Mushrooms', 'Cherry Blossoms', 'Mossy Stones', 'Sunflower Field', 'Lily Pond', 'Autumn Leaves',
    'Butterfly Garden', 'Frosted Berries', 'Orchid Close-up', 'Poppy Meadow', 'Pine Cones',
  ],
  marine: [
    'Tall Ship', 'Harbour at Dawn', 'Coral Reef', 'Lighthouse Storm', 'Fishing Boats', 'Turquoise Lagoon', 'Sailboat Regatta',
    'Sea Cliffs', 'Kelp Forest', 'Rocky Cove',
  ],
  cities: [
    'Rainy Street', 'Canal Houses', 'Night Market', 'Old Town Square', 'Tram Crossing', 'Rooftop Skyline', 'Harbour City',
    'Snowy Boulevard', 'Lantern Alley', 'Cafe Corner',
  ],
  architecture: [
    'Ornate Arches', 'Glass Atrium', 'Courtyard Garden', 'Spiral Staircase', 'Domed Palace', 'Colourful Townhouses',
    'Cathedral Interior', 'Modern Pavilion', 'Tiled Mosque Ceiling', 'Library Hall',
  ],
  food: [
    'Breakfast Spread', 'Fruit Platter', 'Picnic Basket', 'Pastry Counter', 'Spice Market', 'Sushi Board', 'Farmhouse Table',
    'Berry Tart', 'Taco Feast', 'Cheese Board', 'Ramen Bowl',
  ],
  art: [
    'Baroque Portrait', 'Impressionist Garden', 'Venetian Canal Painting', 'Still Life with Flowers', 'Artist Studio',
    'Watercolour Village', 'Renaissance Musician', 'Mosaic Peacock',
  ],
  vehicles: [
    'Vintage Roadster', 'Classic Motorcycle', 'Steam Locomotive', 'Neon Muscle Car', 'Vintage Bus', 'Hot Air Balloons',
    'Rally Car', 'Old Tractor', 'Retro Camper Van',
  ],
  scifi: [
    'Robot Workshop', 'Desert Outpost', 'Floating City', 'Spaceport', 'Cyberpunk Alley', 'Alien Jungle', 'Mech Hangar',
    'Starship Bridge', 'Biodome Colony',
  ],
  space: [
    'Ringed Planet', 'Purple Nebula', 'Earthrise', 'Galaxy Core', 'Moon Base', 'Comet Over Mountains', 'Twin Suns',
    'Asteroid Field', 'Star Cluster',
  ],
  fractals: [
    'Golden Spiral', 'Crystal Lattice', 'Mandelbrot Bloom', 'Neon Fern', 'Kaleidoscope Rose', 'Infinite Shell',
    'Copper Filigree', 'Ice Fractal',
  ],
};

/** Lighting/mood for the prompt, with a short form used in titles. */
const SETTINGS: [phrase: string, title: string][] = [
  ['at golden hour', 'Golden Hour'],
  ['in soft morning light', 'Morning Light'],
  ['under dramatic clouds', 'Storm Clouds'],
  ['in vivid colour', 'Vivid'],
  ['on a crisp winter day', 'Winter'],
  ['in warm sunset light', 'Sunset'],
  ['after rain', 'After Rain'],
  ['in rich autumn tones', 'Autumn'],
  ['in bright midday sun', 'Midday'],
  ['at blue hour', 'Blue Hour'],
  ['under a starry night sky', 'Starlight'],
  ['in spring bloom', 'Spring'],
];

/** Moods that suit space pictures (the everyday ones above don't). */
const SPACE_SETTINGS: [phrase: string, title: string][] = [
  ['against a dense star field', 'Star Field'],
  ['lit by a distant sun', 'Sunlit'],
  ['in natural true colour', 'True Colour'],
  ['seen in infrared light', 'Infrared'],
  ['at the edge of the galaxy', 'Galaxy Edge'],
  ['in deep space', 'Deep Space'],
];

/** The default look: a real, high-end photograph. */
const PHOTO =
  'ultra-realistic professional photograph, shot on a full-frame camera with a sharp prime lens, natural light, ' +
  'true-to-life colours and textures, crisp fine detail, award-winning nature and travel photography quality. ' +
  'Not an illustration, painting, drawing, cartoon or CGI render';

/** Categories that look better with their own style. Everything else gets PHOTO. */
const STYLES: Record<string, string> = {
  art: 'museum-quality fine-art oil painting with rich visible brushwork',
  fractals: 'hyper-detailed 3D fractal render with photoreal materials, reflections and lighting',
  scifi:
    'photorealistic cinematic film still, real-world materials and practical lighting, shot on a cinema camera. ' +
    'Not an illustration, painting or cartoon',
  space:
    'photorealistic astrophotography like NASA Hubble and James Webb telescope images, real nebula colours and natural star fields. ' +
    'Not an illustration, painting or cartoon',
};

/** Guidance that makes an image work well cut into tiles. */
export const PUZZLE_SUFFIX =
  'Stunning, high dynamic range, detailed across the whole frame with varied colours and textures, a clear focal subject, ' +
  'no large blank areas, no text, no letters, no watermark, no border, no frame.';

const pick = <T>(list: T[], rand: () => number): T => list[Math.floor(rand() * list.length)];

/**
 * A new idea whose title isn't in `taken` (lower-case titles already used in the
 * category, including ones waiting for review or still generating). Plain subjects
 * are used first ("Red Fox"), then subject + mood ("Red Fox, Winter").
 * The chosen title is added to `taken` so a batch never repeats itself.
 */
export function pickIdea(categoryId: string, rand: () => number, hint = '', taken: Set<string> = new Set()): PromptIdea {
  // The daily pool and the members' gallery mix every theme so each picture feels different.
  const mixed = categoryId === 'daily' || categoryId === 'members';
  const theme = mixed ? pick(Object.keys(SUBJECTS), rand) : categoryId;
  const subjects = mixed ? Object.values(SUBJECTS).flat() : (SUBJECTS[theme] ?? ['Scenic View']);
  const style = STYLES[theme] ?? PHOTO;
  const extra = hint ? ` Theme: ${hint}.` : '';

  let subject: string;
  let setting: [string, string];
  let title: string;
  const plain = subjects.filter((s) => !taken.has(s.toLowerCase()));
  const moods = (sub: string) => (SUBJECTS.space.includes(sub) ? SPACE_SETTINGS : SETTINGS);
  if (plain.length) {
    subject = pick(plain, rand);
    setting = pick(moods(subject), rand);
    title = subject;
  } else {
    const combos = subjects.flatMap((s) => moods(s).map((st) => [s, st] as const)).filter(([s, st]) => !taken.has(`${s}, ${st[1]}`.toLowerCase()));
    if (combos.length) {
      const [s, st] = pick(combos, rand);
      subject = s;
      setting = st;
      title = `${s}, ${st[1]}`;
    } else {
      subject = pick(subjects, rand);
      setting = pick(moods(subject), rand);
      title = uniqueTitle(`${subject}, ${setting[1]}`, taken);
    }
  }
  taken.add(title.toLowerCase());
  const subjectStyle = mixed ? STYLES[Object.keys(SUBJECTS).find((k) => SUBJECTS[k].includes(subject)) ?? ''] ?? PHOTO : style;
  return { title, prompt: `${subject} ${setting[0]}, ${subjectStyle}.${extra} ${PUZZLE_SUFFIX}` };
}

/** "Title", then "Title 2", "Title 3"… until it isn't taken. Adds the result to `taken`. */
export function uniqueTitle(title: string, taken: Set<string>): string {
  let t = title;
  for (let n = 2; taken.has(t.toLowerCase()); n++) t = `${title} ${n}`;
  taken.add(t.toLowerCase());
  return t;
}

/** Title for a custom prompt: first few meaningful words, title-cased. */
export function titleFromPrompt(prompt: string): string {
  const words = prompt
    .replace(/[^\w\s'-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !/^(a|an|the|of|in|on|at|with|and)$/i.test(w))
    .slice(0, 3);
  return words.map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(' ') || 'New Puzzle';
}
