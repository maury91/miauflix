import { DEFAULT_LANGUAGE_PREFERENCES } from '@mytypes/language-preferences.types';

import { MAX_SEARCH_LANGUAGES, SearchTitlesService } from './search-titles.service';

const TITLES: Record<string, string> = {
  en: 'The Lord of the Rings',
  it: 'Il Signore degli Anelli',
  lt: 'Žiedų valdovas',
  de: 'Der Herr der Ringe',
  pt: 'The Lord of the Rings',
};

const setupTest = (
  preferences: Array<Partial<typeof DEFAULT_LANGUAGE_PREFERENCES>> = [],
  requested: string[] = ['en']
) => {
  let now = 0;
  const catalog = {
    getMovie: jest.fn(async (mediaId: number, language: string) => ({
      mediaType: 'movie' as const,
      mediaId,
      title: TITLES[language] ?? TITLES.en,
    })),
    getTVShow: jest.fn(async (mediaId: number, language: string) => ({
      mediaType: 'tv' as const,
      mediaId,
      name: `${TITLES[language] ?? TITLES.en} (series)`,
    })),
    requestedLanguages: jest.fn(() => requested),
  };
  const users = {
    findLanguagePreferences: jest.fn(async () =>
      preferences.map(choice => ({ ...DEFAULT_LANGUAGE_PREFERENCES, ...choice }))
    ),
  };
  const service = new SearchTitlesService(catalog as never, users, () => now);
  return { service, catalog, users, advance: (ms: number) => (now += ms) };
};

describe('SearchTitlesService', () => {
  it("collects the profiles' interface and audio languages and the languages browsed in", async () => {
    const { service } = setupTest(
      [
        { interface: 'it' },
        { interface: 'it', audio: { default: 'original', anime: null } },
        { audio: { default: 'lt', anime: 'it' } },
      ],
      ['en', 'de', 'it']
    );
    expect(await service.languages()).toEqual(['it', 'lt', 'de']);
  });

  it('keeps the most used languages when there are too many', async () => {
    const codes = ['fr', 'es', 'de', 'pl', 'nl', 'sv', 'cs', 'it'];
    const { service } = setupTest([
      ...codes.map(code => ({ interface: code })),
      { interface: 'it' },
    ]);
    const languages = await service.languages();
    expect(languages).toHaveLength(MAX_SEARCH_LANGUAGES);
    expect(languages[0]).toBe('it');
  });

  it('reads the stored preferences again after a minute', async () => {
    const { service, users, advance } = setupTest([{ interface: 'it' }]);
    await service.languages();
    await service.languages();
    expect(users.findLanguagePreferences).toHaveBeenCalledTimes(1);
    advance(60_001);
    await service.languages();
    expect(users.findLanguagePreferences).toHaveBeenCalledTimes(2);
  });

  it('names the title in each language, leaving out the English title and repeats', async () => {
    const { service } = setupTest([{ interface: 'it' }, { interface: 'lt' }, { interface: 'pt' }]);
    expect(await service.titlesFor('movie', 120, 'The Lord of the Rings')).toEqual([
      'Il Signore degli Anelli',
      'Žiedų valdovas',
    ]);
    expect(await service.titlesFor('show', 120, 'The Lord of the Rings (series)')).toEqual([
      'Il Signore degli Anelli (series)',
      'Žiedų valdovas (series)',
    ]);
  });

  it('skips a language the catalog fails to answer for', async () => {
    const { service, catalog } = setupTest([{ interface: 'it' }, { interface: 'lt' }]);
    catalog.getMovie.mockImplementation(async (mediaId: number, language: string) => {
      if (language === 'it') throw new Error('catalog down');
      return { mediaType: 'movie' as const, mediaId, title: TITLES[language] };
    });
    expect(await service.titlesFor('movie', 120, 'The Lord of the Rings')).toEqual([
      'Žiedų valdovas',
    ]);
  });
});
