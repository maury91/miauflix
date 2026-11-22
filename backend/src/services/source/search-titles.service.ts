import { logger } from '@logger';

import type { Database } from '@database/database';
import type { LanguagePreferences } from '@mytypes/language-preferences.types';
import type { CatalogClientService } from '@services/catalog/catalog-client.service';
import { MIRROR_LANGUAGE } from '@services/media/mirror-language';

/** The most languages a source search adds titles in: each title costs title-only indexers requests. */
export const MAX_SEARCH_LANGUAGES = 6;
/** How long the languages in use are reused before the stored preferences are read again. */
const LANGUAGES_TTL_MS = 60_000;

type Catalog = Pick<CatalogClientService, 'getMovie' | 'getTVShow' | 'requestedLanguages'>;

/** The catalog language a preference names (`it`), or nothing for none or `original`. */
const languageOf = (value: string | null): string[] =>
  value && value !== 'original' ? [value] : [];

/** The languages a profile browses and listens in. */
const preferredLanguages = (preferences: LanguagePreferences): string[] => [
  ...languageOf(preferences.interface),
  ...languageOf(preferences.audio.default),
  ...languageOf(preferences.audio.anime),
];

/**
 * A title's names in the languages the server's profiles use, so source search also finds
 * releases named for them (`Il Signore degli Anelli`). The languages are the profiles' interface
 * and audio preferences plus the languages catalog data was asked for since the server started
 * (profiles that follow their device's language). English, the mirror's own, is left out.
 */
export class SearchTitlesService {
  private cachedLanguages: { expiresAt: number; languages: Promise<string[]> } | null = null;

  constructor(
    private readonly catalog: Catalog,
    private readonly users: Pick<
      ReturnType<Database['getUserRepository']>,
      'findLanguagePreferences'
    >,
    private readonly now: () => number = Date.now
  ) {}

  /** The languages in use besides English, the most used first, at most MAX_SEARCH_LANGUAGES. */
  languages(): Promise<string[]> {
    if (this.cachedLanguages && this.cachedLanguages.expiresAt > this.now())
      return this.cachedLanguages.languages;
    const languages = this.loadLanguages();
    this.cachedLanguages = { expiresAt: this.now() + LANGUAGES_TTL_MS, languages };
    return languages;
  }

  /**
   * The title's names in the languages in use, without `title` itself or repeats. A language the
   * catalog fails to answer for is skipped: the search goes on with the others. `only` asks for
   * those languages instead (a search in one language).
   */
  async titlesFor(
    kind: 'movie' | 'show',
    mediaId: number,
    title: string,
    only?: readonly string[]
  ): Promise<string[]> {
    const languages =
      only ??
      (await this.languages().catch((error: unknown) => {
        logger.warn('SearchTitles', 'Unable to read the languages in use', error);
        return [];
      }));
    const names = await Promise.all(
      languages.map(async language => {
        try {
          const detail =
            kind === 'movie'
              ? await this.catalog.getMovie(mediaId, language)
              : await this.catalog.getTVShow(mediaId, language);
          if (!detail) return null;
          return detail.mediaType === 'movie' ? detail.title : detail.name;
        } catch (error) {
          logger.warn('SearchTitles', `No ${language} title for ${kind} ${mediaId}`, error);
          return null;
        }
      })
    );
    const seen = new Set([title.trim().toLocaleLowerCase()]);
    return names.flatMap(name => {
      const key = name?.trim().toLocaleLowerCase();
      if (!name || !key || seen.has(key)) return [];
      seen.add(key);
      return [name.trim()];
    });
  }

  private async loadLanguages(): Promise<string[]> {
    const counts = new Map<string, number>();
    const count = (language: string) => counts.set(language, (counts.get(language) ?? 0) + 1);
    for (const preferences of await this.users.findLanguagePreferences())
      new Set(preferredLanguages(preferences)).forEach(count);
    for (const language of this.catalog.requestedLanguages())
      if (!counts.has(language)) count(language);
    counts.delete(MIRROR_LANGUAGE);
    return [...counts]
      .sort(([, left], [, right]) => right - left)
      .slice(0, MAX_SEARCH_LANGUAGES)
      .map(([language]) => language);
  }
}
