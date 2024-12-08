import { Page } from '../../types';
import { useAppSelector } from '../../store/store';
import { useEffect } from 'react';

interface NavigationArgs {
  element?: HTMLElement;
  enabled?: boolean;
  page?: Page;
  onBack?: () => void;
  onEnter?: () => void;
  onArrow?: (direction: 'up' | 'down') => boolean;
}

export const useNavigation = ({
  element = document.body,
  enabled = true,
  page,
  onArrow,
  onBack,
  onEnter,
}: NavigationArgs) => {
  const currentPage = useAppSelector((state) => state.app.currentPage);
  const listenForEvents = enabled && (page === currentPage || !page);

  useEffect(() => {
    if (listenForEvents) {
      function handleKeyDown(ev: KeyboardEvent) {
        console.log('handleKeyDown', page);
        if (onBack) {
          if (
            ev.code === 'Backspace' ||
            ev.code === 'Back' ||
            ev.code === 'Escape'
          ) {
            onBack();
            ev.stopPropagation();
          }
        }
        if (onEnter) {
          if (ev.code === 'Enter') {
            onEnter();
            ev.stopPropagation();
          }
        }
        if (onArrow) {
          if (ev.code === 'ArrowUp') {
            if (onArrow('up')) {
              console.log('stop!');
              ev.stopPropagation();
            }
          }
          if (ev.code === 'ArrowDown') {
            if (onArrow('down')) {
              console.log('stop!');
              ev.stopPropagation();
            }
          }
        }
      }

      element.addEventListener('keydown', handleKeyDown, { passive: false });
      return () => element.removeEventListener('keydown', handleKeyDown);
    }
    return;
  }, [element, listenForEvents, onArrow, onBack, onEnter]);
};
