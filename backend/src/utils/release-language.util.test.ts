import { Language } from '@miauflix/source-metadata-extractor';

import {
  madeForOtherLanguage,
  viewerLanguageFirst,
  viewerLanguages,
} from './release-language.util';

const release = (id: number, languages: Language[] | null) => ({ id, languages });

describe('release languages', () => {
  it('reads the viewer languages from the browser and subtitle languages', () => {
    expect(viewerLanguages({ audioLanguages: ['it-IT', 'it', 'en-US'] })).toEqual(['it', 'en']);
    expect(viewerLanguages({ subtitleLanguage: 'fr' })).toEqual(['fr']);
    expect(viewerLanguages({})).toEqual(['en']);
  });

  it.each([
    [[Language.FRENCH, Language.MULTI], ['en'], true],
    [[Language.FRENCH], ['fr'], false],
    [[Language.ITALIAN], ['it', 'en'], false],
    [[Language.ITALIAN, Language.ENGLISH], ['en'], false],
    [[Language.MULTI], ['en'], false],
    [[Language.JAPANESE], ['en'], false],
    [[Language.LITHUANIAN], ['en'], true],
    [[Language.LITHUANIAN], ['lt', 'en'], false],
    [[Language.ITALIAN], ['en'], true],
    [[], ['en'], false],
    [null, ['en'], false],
  ] as const)(
    '%j for a viewer of %j is made for another language: %s',
    (languages, viewer, other) => {
      expect(madeForOtherLanguage(release(1, languages ? [...languages] : null), viewer)).toBe(
        other
      );
    }
  );

  it('moves releases made for another language last, keeping the order otherwise', () => {
    const sources = [
      release(1, [Language.FRENCH, Language.MULTI]),
      release(2, [Language.MULTI]),
      release(3, null),
    ];
    expect(viewerLanguageFirst(sources, ['en']).map(source => source.id)).toEqual([2, 3, 1]);
    // When every release is, there is nothing better to put first.
    expect(viewerLanguageFirst([sources[0]!], ['en'])).toEqual([sources[0]]);
  });
});
