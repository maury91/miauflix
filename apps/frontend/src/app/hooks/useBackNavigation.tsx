import { Page } from '../../types';
import { useAppSelector } from '../../store/store';
import { useEffect } from 'react';

export const useBackNavigation = (page: Page, onBack: () => void) => {
  const currentPage = useAppSelector((state) => state.app.currentPage);

  useEffect(() => {
    if (currentPage === page) {
      function handleBack(ev: KeyboardEvent) {
        console.log(ev);
        if (
          ev.code === 'Backspace' ||
          ev.code === 'Back' ||
          ev.code === 'Escape'
        ) {
          onBack();
        }
      }

      window.addEventListener('keydown', handleBack, { passive: false });
      return () => window.removeEventListener('keydown', handleBack);
    }
    return;
  }, [currentPage, onBack, page]);
};
