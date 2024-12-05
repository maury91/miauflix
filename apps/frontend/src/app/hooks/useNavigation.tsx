import { Page } from '../../types';
import { useAppSelector } from '../../store/store';
import { useEffect } from 'react';

interface NavigationArgs {
  page: Page;
  onBack?: () => void;
  onEnter?: () => void;
  onArrow?: (direction: 'up' | 'down') => void;
}

export const useNavigation = ({
  page,
  onArrow,
  onBack,
  onEnter,
}: NavigationArgs) => {
  const currentPage = useAppSelector((state) => state.app.currentPage);

  useEffect(() => {
    if (currentPage === page) {
      function handleKeyDown(ev: KeyboardEvent) {
        if (onBack) {
          if (
            ev.code === 'Backspace' ||
            ev.code === 'Back' ||
            ev.code === 'Escape'
          ) {
            onBack();
          }
        }
        if (onEnter) {
          if (ev.code === 'Enter') {
            onEnter();
          }
        }
        if (onArrow) {
          if (ev.code === 'ArrowUp') {
            onArrow('up');
          }
          if (ev.code === 'ArrowDown') {
            onArrow('down');
          }
        }
      }

      window.addEventListener('keydown', handleKeyDown, { passive: false });
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
    return;
  }, [currentPage, onArrow, onBack, onEnter, page]);
};
