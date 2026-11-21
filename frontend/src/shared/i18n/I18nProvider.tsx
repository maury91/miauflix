import { type ReactNode, useLayoutEffect, useMemo, useSyncExternalStore } from 'react';

import { I18nContext, type I18nValue } from './I18nContext';
import { resolveInterfaceLanguage, setActiveLanguage, translate } from './translate';

const NO_LANGUAGES: readonly string[] = [];

function subscribeDeviceLanguages(listener: () => void): () => void {
  window.addEventListener('languagechange', listener);
  return () => window.removeEventListener('languagechange', listener);
}

/** The server renders English, so hydration starts from English too. */
function useDeviceLanguages(): readonly string[] {
  return useSyncExternalStore(
    subscribeDeviceLanguages,
    () => navigator.languages ?? NO_LANGUAGES,
    () => NO_LANGUAGES
  );
}

/**
 * Provides the interface language: `preference` (the watching profile's choice), else the
 * device's language. Sets the page's `lang` and the language plain helpers translate with (`t`).
 */
export function I18nProvider({
  preference,
  children,
}: {
  preference?: string | null;
  children: ReactNode;
}) {
  const deviceLanguages = useDeviceLanguages();
  const language = resolveInterfaceLanguage(preference, deviceLanguages);
  // Before the children render, so helpers they call translate into the same language
  setActiveLanguage(language);
  useLayoutEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  const value = useMemo<I18nValue>(
    () => ({ language, t: (key, params) => translate(language, key, params) }),
    [language]
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
