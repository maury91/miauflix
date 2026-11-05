import { describe, expect, it } from 'vitest';

import { COLORS, KINDS, lookFor, randomLook, seededRandom, toAvatar } from './look';

describe('profile looks', () => {
  it('gives a profile without a look the same Plushie every time', () => {
    expect(lookFor(null, 'user-1')).toEqual(lookFor(undefined, 'user-1'));
    expect(lookFor(null, 'user-1')).not.toEqual(lookFor(null, 'user-2'));
  });

  it('keeps stored options it knows and replaces the others', () => {
    const look = lookFor(
      { kind: 'pill', color: '#a65ce8', hat: 'sombrero', eyeSize: 9, cheeks: 'yes' },
      'user-1'
    );
    expect(look.kind).toBe('pill');
    expect(look.color).toBe('#a65ce8');
    expect(look.hat).toBe('none');
    expect(look.eyeSize).toBe(1.6);
    expect(typeof look.cheeks).toBe('boolean');
  });

  it('round-trips through the stored avatar', () => {
    const look = randomLook(seededRandom('round-trip'));
    expect(lookFor(toAvatar(look), 'other')).toEqual(look);
  });

  it('only suggests known shapes and colours', () => {
    const random = seededRandom('suggestions');
    for (let index = 0; index < 50; index += 1) {
      const look = randomLook(random);
      expect(KINDS).toContain(look.kind);
      expect(COLORS.map(({ value }) => value)).toContain(look.color);
    }
  });
});
