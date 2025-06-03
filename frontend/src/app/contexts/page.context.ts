import { Page } from '../../types';
import { createContext, useContext } from 'react';

export const pageContext = createContext<Page | null>(null);

export const PageProvider = pageContext.Provider;

export const usePage = (defaultPage?: Page) => {
  const page = useContext(pageContext);

  if (!page) {
    if (defaultPage) {
      return defaultPage;
    }
    throw new Error('usePage must be used within a PageProvider');
  }

  return page;
};
