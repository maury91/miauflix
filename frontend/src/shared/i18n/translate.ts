import { en, type MessageKey, type Messages } from './messages/en';
import { it } from './messages/it';

/** Interface languages with a full catalog, English first (the fallback). */
export const INTERFACE_LANGUAGES = ['en', 'it'] as const;
export type InterfaceLanguage = (typeof INTERFACE_LANGUAGES)[number];

const CATALOGS: Record<InterfaceLanguage, Messages> = { en, it };

/** Values for a message's `{name}` placeholders; `count` also picks a plural form. */
export type MessageParams = Record<string, string | number>;

export type Translate = (key: MessageKey, params?: MessageParams) => string;

export function isInterfaceLanguage(value: unknown): value is InterfaceLanguage {
  return (INTERFACE_LANGUAGES as readonly unknown[]).includes(value);
}

/**
 * The interface language: the profile's choice when it has a catalog, else the first device
 * language that has one, else English.
 */
export function resolveInterfaceLanguage(
  preference: string | null | undefined,
  deviceLanguages: readonly string[]
): InterfaceLanguage {
  if (isInterfaceLanguage(preference)) return preference;
  for (const tag of deviceLanguages) {
    const code = tag.split(/[-_]/)[0]?.toLowerCase();
    if (isInterfaceLanguage(code)) return code;
  }
  return 'en';
}

const pluralRules = new Map<InterfaceLanguage, Intl.PluralRules>();

function pluralForm(language: InterfaceLanguage, count: number): 'one' | 'other' {
  let rules = pluralRules.get(language);
  if (!rules) {
    rules = new Intl.PluralRules(language);
    pluralRules.set(language, rules);
  }
  return rules.select(count) === 'one' ? 'one' : 'other';
}

/** A message in `language` (English when it has none), with its placeholders filled in. */
export function translate(
  language: InterfaceLanguage,
  key: MessageKey,
  params?: MessageParams
): string {
  const message = CATALOGS[language][key] ?? en[key];
  // A key built at run time (an option value) may have no message: show the key
  if (message === undefined) return key;
  const text =
    typeof message === 'string'
      ? message
      : message[pluralForm(language, Number(params?.['count'] ?? 0))];
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    name in params ? String(params[name]) : placeholder
  );
}

let activeLanguage: InterfaceLanguage = 'en';

/** The language `t` uses; the I18nProvider keeps it in step with the rendered tree. */
export function setActiveLanguage(language: InterfaceLanguage): void {
  activeLanguage = language;
}

export function getActiveLanguage(): InterfaceLanguage {
  return activeLanguage;
}

/**
 * Translate outside React (helpers that build copy during render). Components use `useT`, which
 * also re-renders them when the language changes.
 */
export const t: Translate = (key, params) => translate(activeLanguage, key, params);
