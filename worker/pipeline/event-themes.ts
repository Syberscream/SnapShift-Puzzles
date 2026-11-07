// Idea packs for event pictures: "Title: what to picture", one picture each.
// Admin → Events → Generate pictures fills the list from a pack; edit freely.

export interface ThemePack {
  id: string;
  label: string;
  ideas: string[];
}

export const EVENT_THEMES: ThemePack[] = [
  {
    id: 'winter',
    label: 'Winter',
    ideas: [
      'Snowy Log Cabin: a log cabin in deep fresh snow at blue hour, warm golden light glowing from every window, smoke curling from the chimney, snow-laden pines',
      'Northern Lights Lake: green and violet aurora borealis rippling over a frozen lake, snow-covered spruce forest, stars, mirror-like ice',
      'Frosted Branches: close-up of hoarfrost crystals on red winter berries and twigs, soft morning sun, sparkling ice detail',
      'Mountain Village Snowfall: an alpine village at dusk under heavy snowfall, lit chalets, a little church steeple, mountains behind',
      'Red Fox in Snow: a red fox leaping head-first into deep snow in a sunlit winter meadow, snow spray frozen in the air',
      'Ice Cave: inside a glacier ice cave, translucent blue ice walls with swirling textures, daylight glowing through',
      'Snowy Owl: a snowy owl perched on a frosted fence post, golden eyes, soft falling snow, pale winter light',
      'Winter Steam Train: a vintage steam locomotive crossing a stone viaduct through a snowy mountain valley, plumes of steam',
      'Frozen Waterfall: a tall waterfall frozen into giant icicles and columns, snowy cliffs, cold blue light, tiny pine trees for scale',
      'Skating Pond: villagers ice-skating on a frozen pond at sunset, string lights, snowy trees, warm pink and orange sky',
      'Polar Bear Family: a polar bear mother and two cubs walking across sea ice at golden hour, long shadows',
      'Snow-Covered Forest Path: a winding path through a silent snowy beech forest, sunbeams through misty trees',
      'Hot Cocoa by the Window: a steaming mug of hot chocolate with marshmallows on a wooden windowsill, snowy garden outside, cosy knit blanket',
      'Lapland Reindeer: reindeer pulling a wooden sled across a snowy plain under a pink twilight sky',
      'Ice Hotel Hall: a grand hall carved entirely from ice and snow, glowing blue and violet lighting, ice chandeliers',
      'Snowflake Macro: an extreme macro of a single six-sided snowflake on dark wool, intricate crystal branches',
      'Winter Lighthouse: a lighthouse coated in thick ice on a rocky coast, frozen sea spray, dramatic stormy sky',
      'Snowy Japanese Temple: a red Japanese temple and stone lanterns under fresh snow, bamboo, quiet falling snow',
      'Penguin Colony: emperor penguins huddled on Antarctic ice with chicks, icebergs in the distance, soft light',
      'Cosy Winter Market: a winter market square with wooden stalls, fairy lights, snow on rooftops, people in scarves',
    ],
  },
  {
    id: 'holidays',
    label: 'Holidays',
    ideas: [
      'Decorated Fireplace: a stone fireplace with a crackling fire, stockings, garlands and candles, a decorated tree glowing nearby',
      'Gingerbread Village: a detailed gingerbread village with icing snow, candy windows and tiny lights',
      'Ornament Close-up: glass baubles in red, gold and green hanging on a fir branch, bokeh lights behind',
      'Snowy Town Square Tree: a giant lit tree in a snowy town square at night, shop windows glowing, people walking',
      'Wrapped Presents: a pile of beautifully wrapped presents with ribbons under a lit tree, warm light',
      'Holiday Baking: a rustic kitchen table with cookies being decorated, flour, cookie cutters, cinnamon sticks',
      'Candlelit Window: a frosted window with candles and a pine wreath, snowy village street beyond',
      'Festive Train Set: a model train running around a decorated tree through a tiny snowy village',
      'Winter Wreath Door: a red front door with a lush pine wreath, brass lantern, snow on the steps',
      'Lights Over the City: a city street strung with festive lights at night, snow falling, glowing shop fronts',
      'Sleigh in the Forest: a red wooden sleigh with blankets in a snowy forest clearing, lanterns hanging',
      'Nutcracker Shelf: a row of colourful wooden nutcrackers on a mantelpiece with garland and lights',
      'New Year Fireworks: fireworks bursting over a harbour city at midnight, reflections on the water',
      'Hot Spiced Drinks: mugs of mulled cider with orange slices and star anise on a wooden tray',
      'Snow Globe: a snow globe with a tiny village inside, glitter snow swirling, on a windowsill',
    ],
  },
  {
    id: 'halloween',
    label: 'Halloween',
    ideas: [
      'Pumpkin Patch at Dusk: a field of orange pumpkins at dusk, misty hills, a scarecrow, warm last light',
      'Carved Lanterns: rows of glowing carved jack-o-lanterns on porch steps at night, autumn leaves',
      'Haunted Mansion: an old Victorian mansion on a hill under a full moon, bare trees, bats, fog',
      'Witch’s Kitchen: a cosy cluttered witch’s kitchen with a bubbling cauldron, jars of herbs, candles',
      'Misty Graveyard: an old churchyard with mossy stones in thick fog, lantern light, gnarled tree',
      'Black Cat on a Fence: a black cat with yellow eyes on a wooden fence under a huge orange moon',
      'Autumn Forest Path: a winding forest path covered in red and orange leaves, mist and low sun',
      'Candy Bowl: a bowl overflowing with colourful sweets and caramel apples on a rustic table',
      'Spooky Lantern Forest: paper lanterns hanging in a dark forest, glowing orange, fog between trees',
      'Moonlit Castle: a ruined castle on a cliff under a full moon, crows circling',
      'Owl at Midnight: a barn owl in flight across a full moon over a pumpkin field',
      'Costume Parade: children in colourful costumes walking down a lantern-lit street',
      'Potion Shelf: a shelf of glowing potion bottles in many colours, labels, dripping candles',
      'Harvest Moon: an enormous orange harvest moon rising over a farm, silhouetted barn',
      'Cobweb Morning: dew-covered spider webs on a garden gate at sunrise, sparkling droplets',
    ],
  },
  {
    id: 'spring',
    label: 'Spring',
    ideas: [
      'Cherry Blossom Avenue: an avenue of cherry trees in full pink bloom, petals drifting, soft morning light',
      'Tulip Fields: rows of red, yellow and pink tulips stretching to a windmill under a blue sky',
      'Baby Animals on the Farm: lambs in a green meadow with daisies, a wooden fence, spring sunshine',
      'Rainy Garden: raindrops on bright spring flowers in a garden after a shower, sunlight breaking through',
      'Bluebell Woods: a beech wood carpeted with bluebells, sunbeams through fresh green leaves',
      'Robin’s Nest: a nest with blue eggs in a blossoming branch, soft focus background',
      'Lakeside Picnic: a picnic blanket by a lake with a basket, lemonade and blossoms',
      'Butterfly Garden: colourful butterflies on lavender and coneflowers, bright and detailed',
      'Mountain Meadow Thaw: snow melting in a mountain meadow, wildflowers and rushing streams',
      'Countryside Rainbow: a rainbow over rolling green fields and a little farmhouse',
      'Ducklings on a Pond: a mother duck with ducklings on a calm pond among reeds',
      'Blossom Teahouse: a traditional teahouse framed by plum blossom, stone path, koi pond',
      'Hot Air Balloons at Dawn: colourful hot air balloons rising over green valleys at sunrise',
      'Seed Packets and Pots: a potting bench with seedlings, terracotta pots and seed packets',
      'Wisteria Tunnel: a tunnel of hanging purple wisteria, dappled light',
    ],
  },
  {
    id: 'summer',
    label: 'Summer',
    ideas: [
      'Tropical Lagoon: a turquoise lagoon with palm trees, white sand and a wooden boat',
      'Beach Huts: a row of colourful beach huts along a sunny seafront',
      'Lighthouse Sunset: a lighthouse on a grassy cliff at sunset, golden sea',
      'Ice Cream Stand: a vintage ice cream cart with colourful scoops on a sunny promenade',
      'Coral Reef: a vibrant coral reef with tropical fish, sun rays through clear water',
      'Sunflower Field: endless sunflowers under a bright summer sky, a farm track',
      'Summer Night Fireflies: fireflies glowing over a meadow at twilight, warm sky',
      'Mediterranean Village: white houses with blue doors and bougainvillea above a sparkling sea',
      'Campfire Under Stars: a campfire by a tent near a lake, the Milky Way overhead',
      'Surfers at Golden Hour: surfers riding glassy waves at golden hour, spray backlit',
      'Fruit Market: a market stall piled with watermelons, peaches and berries',
      'Sailboats in a Harbour: colourful sailboats moored in a harbour town, bunting',
      'Hammock in Paradise: a hammock between palms over clear shallow water',
      'Mountain Lake Swim: a crystal-clear alpine lake with a wooden jetty, peaks behind',
      'Lavender Fields: rows of purple lavender in Provence with a stone farmhouse',
    ],
  },
  {
    id: 'autumn',
    label: 'Autumn',
    ideas: [
      'Maple Valley: a valley of blazing red and orange maples around a winding river, mist',
      'Apple Orchard Harvest: baskets of red apples in an orchard, ladder against a tree, golden light',
      'Rainy Café Window: a café window with rain drops, autumn street with umbrellas outside',
      'Forest Mushrooms: colourful mushrooms on a mossy log in an autumn forest',
      'Covered Bridge: a red covered bridge over a stream surrounded by autumn colour',
      'Deer in Morning Mist: a stag in a misty autumn meadow at sunrise',
      'Harvest Table: a long table set with squash, candles, bread and autumn leaves',
      'Hedgehog in Leaves: a hedgehog snuffling through fallen leaves',
      'Vineyard at Harvest: rows of grapevines in autumn colour with a hilltop village',
      'Leaf Pile Fun: a dog leaping into a big pile of autumn leaves',
      'Lantern Festival: paper lanterns along a river at dusk among autumn trees',
      'Mountain Larches: golden larch trees on a mountainside under fresh snow peaks',
      'Pumpkin Spice Kitchen: pies cooling on a windowsill, cinnamon and leaves',
      'Rowing on the Lake: a rowing boat on a still lake reflecting autumn woods',
      'Woolly Sweater Morning: a steaming mug, a knit sweater and a book by a rainy window',
    ],
  },
  {
    id: 'valentines',
    label: 'Valentine’s',
    ideas: [
      'Rose Garden: a garden of red and pink roses in full bloom, dew drops, soft light',
      'Paris Evening: the Eiffel Tower at dusk with glowing street lamps and a café',
      'Heart-Shaped Chocolates: an open box of glossy chocolates, rose petals around',
      'Love Lock Bridge: padlocks on a bridge railing over a river at sunset',
      'Candlelit Dinner: a table for two with candles, roses and city lights through the window',
      'Swans on a Lake: two swans forming a heart shape on a misty lake',
      'Flower Market: buckets of tulips and roses at a street flower market',
      'Venetian Gondola: a gondola gliding through a Venice canal at golden hour',
      'Lanterns in the Sky: glowing lanterns rising into a twilight sky over a lake',
      'Strawberries and Cream: bowls of strawberries and cream on a pink tablecloth',
    ],
  },
];

/** "Title: what to picture" → { title, subject }. Without a colon, the title is made from the first words. */
export function splitIdea(line: string): { title: string; subject: string } {
  const i = line.indexOf(':');
  if (i > 0 && i <= 60) return { title: line.slice(0, i).trim(), subject: line.slice(i + 1).trim() || line.slice(0, i).trim() };
  const words = line.replace(/[^\p{L}\p{N}\s'’-]/gu, ' ').split(/\s+/).filter(Boolean).slice(0, 4);
  return { title: words.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') || 'Event picture', subject: line.trim() };
}
