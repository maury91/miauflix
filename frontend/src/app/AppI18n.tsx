import { I18nProvider } from '@shared/i18n';
import { useAppSelector } from '@store';
import { selectCurrentUser } from '@store/slices/auth';
import type { ReactNode } from 'react';

/** The interface in the watching profile's language (the device's before anyone watches). */
export function AppI18n({ children }: { children: ReactNode }) {
  const preference = useAppSelector(selectCurrentUser)?.languagePreferences?.interface;
  return <I18nProvider preference={preference}>{children}</I18nProvider>;
}
