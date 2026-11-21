import { describe, expect, it } from 'vitest';

import { en } from './messages/en';
import { it as italian } from './messages/it';
import { resolveInterfaceLanguage, translate } from './translate';

describe('translate', () => {
  it('fills placeholders in the chosen language', () => {
    expect(translate('it', 'playerLanguages.withSubtitles', { language: 'Italiano' })).toBe(
      'Italiano con sottotitoli'
    );
    expect(translate('en', 'playerLanguages.withSubtitles', { language: 'Italian' })).toBe(
      'Italian with subtitles'
    );
  });

  it('has every English message in Italian, with the same placeholders', () => {
    const placeholders = (message: unknown) =>
      JSON.stringify(message)
        .match(/\{\w+\}/g)
        ?.sort() ?? [];
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(italian[key], key).toBeDefined();
      expect(placeholders(italian[key]), key).toEqual(placeholders(en[key]));
    }
  });
});

describe('resolveInterfaceLanguage', () => {
  it("uses the profile's choice, then the first device language with a catalog", () => {
    expect(resolveInterfaceLanguage('it', ['en-US'])).toBe('it');
    expect(resolveInterfaceLanguage(null, ['lt-LT', 'it-IT', 'en'])).toBe('it');
    expect(resolveInterfaceLanguage('xx', ['lt'])).toBe('en');
  });
});
