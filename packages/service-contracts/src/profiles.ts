/**
 * Profile avatars: the Plushie options a stored look may use, and the "Surprise me" generator.
 * The frontend editor and the backend (which gives new and existing profiles a look) share
 * them, so a look generated on either side is one the editor can show and change.
 *
 * Option names are the `plushies` package's options.
 */

export const PLUSHIE_KINDS = [
  'pill',
  'squircle',
  'circle',
  'egg',
  'bean',
  'blob',
  'cloud',
  'heart',
  'star',
  'flower',
  'ghost',
  'drop',
  'arch',
  'diamond',
  'square',
  'triangle',
  'polygon',
] as const;
export const PLUSHIE_FABRICS = ['plush', 'felt', 'velvet', 'shaggy', 'fleece'] as const;
export const PLUSHIE_EYES = ['dot', 'oval', 'happy', 'sleepy', 'ring', 'googly'] as const;
export const PLUSHIE_MOUTHS = ['smile', 'grin', 'open', 'cat', 'flat', 'none'] as const;
export const PLUSHIE_MOUSTACHES = ['none', 'curly', 'walrus', 'pencil'] as const;
export const PLUSHIE_GLASSES = ['none', 'round', 'square', 'monocle', 'shades'] as const;
export const PLUSHIE_HATS = [
  'none',
  'cowboy',
  'beanie',
  'cap',
  'top',
  'party',
  'crown',
  'santa',
  'graduation',
  'fez',
  'hardhat',
  'fireman',
  'halo',
] as const;
export const PLUSHIE_NECKS = ['none', 'bowtie', 'necktie'] as const;
export const PLUSHIE_PINS = ['none', 'flower', 'bow', 'heart', 'star', 'badge'] as const;

/** The editor's fur colours, warm to cool, then neutrals. */
export const PLUSHIE_COLORS = [
  { name: 'Sunflower', value: '#f2b33d' },
  { name: 'Tangerine', value: '#f28a2e' },
  { name: 'Coral', value: '#f47c68' },
  { name: 'Pink', value: '#f06c96' },
  { name: 'Red', value: '#e23b3b' },
  { name: 'Purple', value: '#a65ce8' },
  { name: 'Blue', value: '#3d9be9' },
  { name: 'Teal', value: '#3fb8ad' },
  { name: 'Green', value: '#4caf62' },
  { name: 'Cream', value: '#f1e7c9' },
  { name: 'Grey', value: '#9a9fa3' },
] as const;

/** A look as "Surprise me" makes it: every option chosen, no fine-tuning. */
export interface RandomPlushieLook {
  kind: (typeof PLUSHIE_KINDS)[number];
  color: string;
  fabric: (typeof PLUSHIE_FABRICS)[number];
  eyes: (typeof PLUSHIE_EYES)[number];
  mouth: (typeof PLUSHIE_MOUTHS)[number];
  cheeks: boolean;
  moustache: (typeof PLUSHIE_MOUSTACHES)[number];
  glasses: (typeof PLUSHIE_GLASSES)[number];
  hat: (typeof PLUSHIE_HATS)[number];
  neck: (typeof PLUSHIE_NECKS)[number];
  pin: (typeof PLUSHIE_PINS)[number];
}

const pick = <T>(values: readonly T[], random: () => number): T =>
  values[Math.floor(random() * values.length) % values.length];

/** A cheerful random Plushie: always a face, and an accessory only sometimes. */
export function randomPlushieLook(random: () => number = Math.random): RandomPlushieLook {
  // The first option of each accessory list is 'none'.
  const sometimes = <T>(values: readonly T[], chance: number): T =>
    random() < chance ? pick(values.slice(1), random) : values[0];
  return {
    kind: pick(['pill', 'squircle', 'circle', 'egg', 'bean', 'blob', 'cloud', 'ghost'], random),
    color: pick(PLUSHIE_COLORS, random).value,
    fabric: pick(PLUSHIE_FABRICS, random),
    eyes: pick(['dot', 'oval', 'happy', 'googly'], random),
    mouth: pick(['smile', 'grin', 'open', 'cat'], random),
    cheeks: random() < 0.75,
    moustache: sometimes(PLUSHIE_MOUSTACHES, 0.15),
    glasses: sometimes(PLUSHIE_GLASSES, 0.25),
    hat: sometimes(PLUSHIE_HATS, 0.35),
    neck: sometimes(PLUSHIE_NECKS, 0.15),
    pin: sometimes(PLUSHIE_PINS, 0.3),
  };
}

/** A repeatable random source from a string, e.g. a profile's id. */
export function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    state = Math.imul(state ^ seed.charCodeAt(index), 16777619);
  }
  return () => {
    state = Math.imul(state ^ (state >>> 15), 2246822507);
    state = Math.imul(state ^ (state >>> 13), 3266489909);
    state ^= state >>> 16;
    return (state >>> 0) / 4294967296;
  };
}
