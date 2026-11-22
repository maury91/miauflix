import { listsApi } from '@features/media/api/lists.api';
import { mediaApi } from '@features/media/api/media.api';
import { takeStaleCatalogLanguage } from '@features/media/lib/catalog-language';
import { I18nProvider, useInterfaceLanguage } from '@shared/i18n';
import { useAppDispatch, useAppSelector } from '@store';
import { selectCurrentUser } from '@store/slices/auth';
import { type ReactNode, useEffect } from 'react';

/**
 * Catalog data (titles, overviews, genres) follows the interface language: when it changes, the
 * titles loaded in another language load again.
 */
function CatalogLanguage() {
  const language = useInterfaceLanguage();
  const dispatch = useAppDispatch();
  useEffect(() => {
    if (!takeStaleCatalogLanguage(language)) return;
    dispatch(mediaApi.util.invalidateTags(['Catalog']));
    dispatch(listsApi.util.invalidateTags(['Catalog']));
  }, [dispatch, language]);
  return null;
}

/** The interface in the watching profile's language (the device's before anyone watches). */
export function AppI18n({ children }: { children: ReactNode }) {
  const preference = useAppSelector(selectCurrentUser)?.languagePreferences?.interface;
  return (
    <I18nProvider preference={preference}>
      <CatalogLanguage />
      {children}
    </I18nProvider>
  );
}
