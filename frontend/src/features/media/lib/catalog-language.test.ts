import { setActiveLanguage } from '@shared/i18n/translate';
import { afterEach, describe, expect, it } from 'vitest';

import { catalogLanguage, takeStaleCatalogLanguage } from './catalog-language';

describe('catalog language', () => {
  afterEach(() => {
    setActiveLanguage('en');
    takeStaleCatalogLanguage('en');
  });

  it('asks the catalog in the interface language', () => {
    setActiveLanguage('it');
    expect(catalogLanguage()).toBe('it');
  });

  it('reports data loaded in another language once', () => {
    catalogLanguage();
    expect(takeStaleCatalogLanguage('it')).toBe(true);
    expect(takeStaleCatalogLanguage('it')).toBe(false);
  });

  it('has nothing to reload when everything was loaded in the same language', () => {
    setActiveLanguage('it');
    catalogLanguage();
    expect(takeStaleCatalogLanguage('it')).toBe(false);
  });

  it('keeps the language data was loaded in while nothing is stale', () => {
    setActiveLanguage('it');
    catalogLanguage();
    expect(takeStaleCatalogLanguage('it')).toBe(false);
    expect(takeStaleCatalogLanguage('en')).toBe(true);
  });
});
