import { createContext, useContext } from 'react';

import { type InterfaceLanguage, type Translate, translate } from './translate';

export interface I18nValue {
  language: InterfaceLanguage;
  t: Translate;
}

const english: I18nValue = { language: 'en', t: (key, params) => translate('en', key, params) };

export const I18nContext = createContext<I18nValue>(english);

/** The interface language's translate function; re-renders the caller when it changes. */
export function useT(): Translate {
  return useContext(I18nContext).t;
}

export function useInterfaceLanguage(): InterfaceLanguage {
  return useContext(I18nContext).language;
}
