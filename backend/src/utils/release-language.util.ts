import { Language } from '@miauflix/source-metadata-extractor';

import type { ContentSource } from '@entities/content-source.entity';

/** ISO 639-1 and 639-2 codes of each language a release name can give. */
const CODES: Partial<Record<Language, string[]>> = {
  [Language.ENGLISH]: ['en', 'eng'],
  [Language.FRENCH]: ['fr', 'fra', 'fre'],
  [Language.SPANISH]: ['es', 'spa'],
  [Language.GERMAN]: ['de', 'deu', 'ger'],
  [Language.ITALIAN]: ['it', 'ita'],
  [Language.PORTUGUESE]: ['pt', 'por'],
  [Language.DUTCH]: ['nl', 'nld', 'dut'],
  [Language.SWEDISH]: ['sv', 'swe'],
  [Language.CZECH]: ['cs', 'ces', 'cze'],
  [Language.SLOVAK]: ['sk', 'slk', 'slo'],
  [Language.CHINESE]: ['zh', 'zho', 'chi'],
  [Language.JAPANESE]: ['ja', 'jpn'],
  [Language.KOREAN]: ['ko', 'kor'],
  [Language.LITHUANIAN]: ['lt', 'lit'],
};

/**
 * Languages a release name gives only when it was made for that language's market: a dub or
 * local subtitles (FRENCH, VOSTFR, ITA). An original-language tag (JAPANESE for anime) or
 * MULTI says nothing about who it was made for.
 */
const MARKET_LANGUAGES = new Set<Language>([
  Language.FRENCH,
  Language.SPANISH,
  Language.GERMAN,
  Language.ITALIAN,
  Language.PORTUGUESE,
  Language.DUTCH,
  Language.SWEDISH,
  Language.CZECH,
  Language.SLOVAK,
  Language.LITHUANIAN,
]);

/**
 * The ISO 639 codes the viewer understands: the primary subtags of their audio languages (the
 * browser's, "it-IT" → "it") and their subtitle language. English when none is known.
 */
export function viewerLanguages(preferences: {
  audioLanguages?: readonly string[];
  subtitleLanguage?: string;
}): string[] {
  const codes = [...(preferences.audioLanguages ?? []), preferences.subtitleLanguage ?? '']
    .map(tag => tag.split(/[-_]/)[0]!.toLowerCase())
    .filter(Boolean);
  return codes.length ? [...new Set(codes)] : ['en'];
}

/**
 * True when the release was made for another language's market than the viewer's: its name
 * gives a dub or local-subtitle language (French, Italian…) and neither one of the viewer's
 * languages (ISO 639 codes) nor English. Such a release may play with that audio or those
 * subtitles only, so it ranks after the others.
 */
export function madeForOtherLanguage(
  source: Pick<ContentSource, 'languages'>,
  viewer: readonly string[] = ['en']
): boolean {
  const languages = source.languages ?? [];
  const understood = (language: Language) =>
    CODES[language]?.some(code => viewer.includes(code)) ?? false;
  // English is the one most viewers follow too, so an English release is never demoted.
  if (languages.some(understood) || languages.includes(Language.ENGLISH)) return false;
  return languages.some(language => MARKET_LANGUAGES.has(language));
}

/** The sources in the same order, those made for another language's market last. */
export function viewerLanguageFirst<T extends Pick<ContentSource, 'languages'>>(
  sources: T[],
  viewer?: readonly string[]
): T[] {
  const other = sources.filter(source => madeForOtherLanguage(source, viewer));
  if (!other.length || other.length === sources.length) return sources;
  return [...sources.filter(source => !other.includes(source)), ...other];
}
