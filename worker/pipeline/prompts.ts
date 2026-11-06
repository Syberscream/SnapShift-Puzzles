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

const SETTINGS = [
  'at golden hour', 'in soft morning light', 'under dramatic clouds', 'in vivid colour', 'on a crisp winter day',
  'in warm sunset light', 'after rain', 'in rich autumn tones', 'in bright midday sun', 'at blue hour',
];

const STYLES: Record<string, string> = {
  art: 'painterly fine-art style with visible brushwork',
  fractals: 'intricate digital art with fine detail',
  scifi: 'cinematic concept art',
  space: 'cinematic space art',
};

/** Guidance that makes an image work well cut into tiles. */
export const PUZZLE_SUFFIX =
  'Detailed throughout the whole frame with varied colours and textures, a clear focal subject, ' +
  'no large blank areas, no text, no letters, no watermark, no border.';

export function pickIdea(categoryId: string, rand: () => number, hint = '', avoidTitles: Set<string> = new Set()): PromptIdea {
  // The daily pool mixes every theme so each day feels different.
  if (categoryId === 'daily') {
    const themes = Object.keys(SUBJECTS);
    return pickIdea(themes[Math.floor(rand() * themes.length)], rand, hint, avoidTitles);
  }
  const subjects = SUBJECTS[categoryId] ?? ['Scenic View'];
  const fresh = subjects.filter((s) => !avoidTitles.has(s.toLowerCase()));
  const pool = fresh.length ? fresh : subjects;
  const subject = pool[Math.floor(rand() * pool.length)];
  const setting = SETTINGS[Math.floor(rand() * SETTINGS.length)];
  const style = STYLES[categoryId] ?? 'high-resolution photograph';
  const extra = hint ? ` Theme: ${hint}.` : '';
  return {
    title: subject,
    prompt: `${subject} ${setting}, ${style}.${extra} ${PUZZLE_SUFFIX}`,
  };
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
