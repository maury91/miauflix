import { getKeyboardNavigationAction } from '@shared/hooks/useKeyboardNavigation';

export type HomeAction = 'left' | 'right' | 'up' | 'down' | 'confirm' | 'back';

export type NavigationOutcome =
  | { type: 'handled' }
  | { type: 'escape'; direction: 'left' | 'right' | 'up' | 'down' }
  | { type: 'activate' }
  | { type: 'ignored' };

export const getHomeAction = getKeyboardNavigationAction;

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
