import type { AvatarLook } from '@miauflix/backend';
import {
  PLUSHIE_COLORS,
  PLUSHIE_EYES,
  PLUSHIE_FABRICS,
  PLUSHIE_GLASSES,
  PLUSHIE_HATS,
  PLUSHIE_KINDS,
  PLUSHIE_MOUSTACHES,
  PLUSHIE_MOUTHS,
  PLUSHIE_NECKS,
  PLUSHIE_PINS,
  randomPlushieLook,
  seededRandom,
} from '@miauflix/service-contracts/profiles/v1';
import type {
  PlushieEyes,
  PlushieFabric,
  PlushieGlasses,
  PlushieHat,
  PlushieKind,
  PlushieMoustache,
  PlushieMouth,
  PlushieNeck,
  PlushiePin,
} from 'plushies';

/**
 * A profile's Plushie, as the editor builds it and the server stores it. Option names are the
 * `plushies` options, so a look passes straight to the viewer.
 */
export interface PlushieLook {
  kind: PlushieKind;
  color: string;
  fabric: PlushieFabric;
  eyes: PlushieEyes;
  mouth: PlushieMouth;
  cheeks: boolean;
  moustache: PlushieMoustache;
  glasses: PlushieGlasses;
  hat: PlushieHat;
  neck: PlushieNeck;
  pin: PlushiePin;
  /** Fine-tune values; left out they follow the library defaults. */
  roundness?: number;
  thickness?: number;
  eyeSize?: number;
  eyeSpacing?: number;
  faceY?: number;
  hatSize?: number;
}

// The option lists and the generator are shared with the backend, which gives profiles a look.
export const KINDS: readonly PlushieKind[] = PLUSHIE_KINDS;
export const FABRICS: readonly PlushieFabric[] = PLUSHIE_FABRICS;
export const EYES: readonly PlushieEyes[] = PLUSHIE_EYES;
export const MOUTHS: readonly PlushieMouth[] = PLUSHIE_MOUTHS;
export const MOUSTACHES: readonly PlushieMoustache[] = PLUSHIE_MOUSTACHES;
export const GLASSES: readonly PlushieGlasses[] = PLUSHIE_GLASSES;
export const HATS: readonly PlushieHat[] = PLUSHIE_HATS;
export const NECKS: readonly PlushieNeck[] = PLUSHIE_NECKS;
export const PINS: readonly PlushiePin[] = PLUSHIE_PINS;

/** The editor's fur colours, warm to cool, then neutrals. */
export const COLORS: readonly { name: string; value: string }[] = PLUSHIE_COLORS;

export interface FineTune {
  key: keyof Pick<
    PlushieLook,
    'eyeSize' | 'eyeSpacing' | 'faceY' | 'hatSize' | 'roundness' | 'thickness'
  >;
  label: string;
  min: number;
  max: number;
  step: number;
  /** The library default, shown when the look leaves the value out. */
  defaultValue: number;
}

export const FINE_TUNES: readonly FineTune[] = [
  { key: 'roundness', label: 'Roundness', min: 0, max: 1, step: 0.05, defaultValue: 0.6 },
  { key: 'thickness', label: 'Stuffing', min: 0.25, max: 0.6, step: 0.01, defaultValue: 0.42 },
  { key: 'eyeSize', label: 'Eye size', min: 0.6, max: 1.6, step: 0.05, defaultValue: 1 },
  { key: 'eyeSpacing', label: 'Eye spacing', min: 0.6, max: 1.5, step: 0.05, defaultValue: 1 },
  { key: 'faceY', label: 'Face height', min: -0.3, max: 0.3, step: 0.02, defaultValue: 0 },
  { key: 'hatSize', label: 'Hat size', min: 0.6, max: 1.4, step: 0.05, defaultValue: 1 },
];

/** A cheerful random Plushie ("Surprise me"): always a face, and an accessory only sometimes. */
export function randomLook(random: () => number = Math.random): PlushieLook {
  return randomPlushieLook(random);
}

export { seededRandom };

const oneOf = <T extends string>(values: readonly T[], value: unknown, fallback: T): T =>
  typeof value === 'string' && (values as readonly string[]).includes(value)
    ? (value as T)
    : fallback;

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/**
 * The look to draw for a profile. Stored values outside the known options are replaced, and
 * a profile that never chose one gets a Plushie picked from its id.
 */
export function lookFor(avatar: AvatarLook | null | undefined, userId: string): PlushieLook {
  const fallback = randomLook(seededRandom(userId));
  if (!avatar) return fallback;
  const { kind, color, fabric, eyes, mouth, cheeks, moustache, glasses, hat, neck, pin } = avatar;
  const look: PlushieLook = {
    kind: oneOf(KINDS, kind, fallback.kind),
    color: typeof color === 'string' && HEX_COLOR.test(color) ? color : fallback.color,
    fabric: oneOf(FABRICS, fabric, fallback.fabric),
    eyes: oneOf([...EYES, 'none'], eyes, fallback.eyes),
    mouth: oneOf(MOUTHS, mouth, fallback.mouth),
    cheeks: typeof cheeks === 'boolean' ? cheeks : fallback.cheeks,
    moustache: oneOf(MOUSTACHES, moustache, 'none'),
    glasses: oneOf(GLASSES, glasses, 'none'),
    hat: oneOf(HATS, hat, 'none'),
    neck: oneOf(NECKS, neck, 'none'),
    pin: oneOf(PINS, pin, 'none'),
  };
  FINE_TUNES.forEach(({ key, min, max }) => {
    const value = avatar[key];
    if (typeof value === 'number' && Number.isFinite(value))
      look[key] = Math.min(max, Math.max(min, value));
  });
  return look;
}

/** The look as stored by the server. */
export function toAvatar(look: PlushieLook): AvatarLook {
  return Object.fromEntries(
    Object.entries(look).filter(([, value]) => value !== undefined)
  ) as AvatarLook;
}

/** Labels for option values, e.g. `hardhat` → `Hard hat`. */
const LABELS: Partial<Record<string, string>> = {
  hardhat: 'Hard hat',
  top: 'Top hat',
  bowtie: 'Bow tie',
  necktie: 'Necktie',
  none: 'None',
  graduation: 'Grad cap',
};

export function optionLabel(value: string): string {
  return LABELS[value] ?? value.charAt(0).toUpperCase() + value.slice(1);
}
