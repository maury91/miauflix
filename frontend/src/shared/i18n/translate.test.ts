import { describe, expect, it } from 'vitest';

import { en } from './messages/en';
import { it as italian } from './messages/it';
import { lt } from './messages/lt';
import { resolveInterfaceLanguage, translate } from './translate';

describe('translate', () => {
  it('fills placeholders in the chosen language', () => {
    expect(translate('it', 'playerLanguages.withSubtitles', { language: 'Italiano' })).toBe(
      'Italiano con sottotitoli'
    );
    expect(translate('en', 'playerLanguages.withSubtitles', { language: 'Italian' })).toBe(
      'Italian with subtitles'
    );
    expect(translate('lt', 'playerLanguages.withSubtitles', { language: 'Lietuvių' })).toBe(
      'Lietuvių su subtitrais'
    );
  });

  it.each([
    ['Italian', italian],
    ['Lithuanian', lt],
  ] as const)('has every English message in %s, with the same placeholders', (_, catalog) => {
    const placeholders = (message: string) => (message.match(/\{\w+\}/g) ?? []).sort();
    expect(Object.keys(catalog).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      const source = en[key];
      const message = catalog[key];
      if (typeof source === 'string') {
        expect(typeof message, key).toBe('string');
        expect(placeholders(String(message)), key).toEqual(placeholders(source));
      } else {
        expect(typeof message, key).toBe('object');
        for (const [form, text] of Object.entries(message)) {
          expect(placeholders(text), `${key}.${form}`).toEqual(
            placeholders(form === 'one' ? source.one : source.other)
          );
        }
      }
    }
  });

  it.each([
    [0, '0 rezultatų'],
    [1, '1 rezultatas'],
    [2, '2 rezultatai'],
    [11, '11 rezultatų'],
    [21, '21 rezultatas'],
    [22, '22 rezultatai'],
  ])('uses the Lithuanian plural form for %s', (count, expected) => {
    expect(translate('lt', 'search.resultCount', { count })).toBe(expected);
  });
});

describe('resolveInterfaceLanguage', () => {
  it("uses the profile's choice, then the first device language with a catalog", () => {
    expect(resolveInterfaceLanguage('it', ['en-US'])).toBe('it');
    expect(resolveInterfaceLanguage('lt', ['en-US'])).toBe('lt');
    expect(resolveInterfaceLanguage(null, ['xx', 'lt-LT', 'it-IT', 'en'])).toBe('lt');
    expect(resolveInterfaceLanguage('xx', ['fr-FR'])).toBe('en');
  });
});
