import { getKeyboardNavigationAction } from '@shared/hooks/useKeyboardNavigation';

export type HomeAction = 'left' | 'right' | 'up' | 'down' | 'confirm' | 'back';
/** Used only to describe the user's current focus to realtime preload APIs. */
export type HomeView = 'browse' | 'details' | 'player';
export type HomeRegion = 'sidebar' | 'carousel' | 'details' | 'player';

export type NavigationOutcome =
  | { type: 'handled' }
  | { type: 'escape'; direction: 'left' | 'right' | 'up' | 'down' }
  | { type: 'activate' }
  | { type: 'ignored' };

export const getHomeAction = getKeyboardNavigationAction;

export function resolveCarouselAction<T>(
  action: HomeAction,
  index: number,
  total: number,
  selectedMedia: T | null
): { outcome: NavigationOutcome; nextIndex?: number; activation?: T } {
  if (action === 'up' || action === 'down') {
    return { outcome: { type: 'escape', direction: action } };
  }
  if (action === 'left' && index > 0) {
    return { outcome: { type: 'handled' }, nextIndex: index - 1 };
  }
  if (action === 'right' && index < total - 1) {
    return { outcome: { type: 'handled' }, nextIndex: index + 1 };
  }
  if (action === 'confirm' && selectedMedia) {
    return { outcome: { type: 'activate' }, activation: selectedMedia };
  }
  return { outcome: moveIndex(action, index, total) };
}

export function moveIndex(action: HomeAction, index: number, total: number): NavigationOutcome {
  if (total <= 0) return { type: 'ignored' };

  if (action === 'left') {
    return index > 0 ? { type: 'handled' } : { type: 'escape', direction: 'left' };
  }
  if (action === 'right') {
    return index < total - 1 ? { type: 'handled' } : { type: 'handled' };
  }
  if (action === 'up' || action === 'down') {
    return { type: 'escape', direction: action };
  }
  if (action === 'confirm') return { type: 'activate' };
  return { type: 'ignored' };
}
