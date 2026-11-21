import type { MessageKey } from './messages/en';
import { t } from './translate';

/** Languages offered for audio and subtitles: the ones subtitle search supports. */
export const MEDIA_LANGUAGES = [
  'en',
  'it',
  'lt',
  'pl',
  'ru',
  'es',
  'fr',
  'de',
  'pt',
  'ja',
  'ko',
  'zh',
] as const;

/** Audio preference value that plays the language a title was made in. */
export const ORIGINAL_LANGUAGE = 'original';

/** The primary subtag of a language tag (`it-IT`, `ita`, `it_IT` → `it`); undefined if unreadable. */
export function primaryLanguage(code: string | null | undefined): string | undefined {
  if (!code) return undefined;
  try {
    return new Intl.Locale(code.replace(/_/g, '-')).language;
  } catch {
    return undefined;
  }
}

/** Three-letter codes media files often carry, for the languages without Intl.Locale mapping. */
const ISO_639_2: Record<string, string> = {
  eng: 'en',
  ita: 'it',
  lit: 'lt',
  pol: 'pl',
  rus: 'ru',
  spa: 'es',
  fre: 'fr',
  fra: 'fr',
  ger: 'de',
  deu: 'de',
  por: 'pt',
  jpn: 'ja',
  kor: 'ko',
  chi: 'zh',
  zho: 'zh',
};

/** A media language tag as the ISO 639-1 code the preferences use, when there is one. */
export function mediaLanguage(code: string | null | undefined): string | undefined {
  const primary = primaryLanguage(code)?.toLowerCase();
  if (!primary) return undefined;
  return ISO_639_2[primary] ?? primary;
}

/**
 * A language's name in the interface language. The offered languages are translated; others use
 * the browser's names where it has them (older TVs do not), else the code.
 */
export function languageName(code: string): string {
  const language = mediaLanguage(code) ?? code;
  if ((MEDIA_LANGUAGES as readonly string[]).includes(language))
    return t(`language.${language}` as MessageKey);
  try {
    const name = new Intl.DisplayNames([t('meta.locale')], { type: 'language' }).of(language);
    if (name) return name.charAt(0).toLocaleUpperCase() + name.slice(1);
  } catch {
    // No Intl.DisplayNames, or an unfamiliar tag
  }
  return code;
}
