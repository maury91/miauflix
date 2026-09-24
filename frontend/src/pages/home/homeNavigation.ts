export type HomeAction = 'left' | 'right' | 'up' | 'down' | 'confirm' | 'back';

export type NavigationOutcome =
  | { type: 'handled' }
  | { type: 'escape'; direction: 'left' | 'right' | 'up' | 'down' }
  | { type: 'activate' }
  | { type: 'ignored' };

export function getHomeAction(key: string): HomeAction | null {
  switch (key) {
    case 'ArrowLeft':
      return 'left';
    case 'ArrowRight':
      return 'right';
    case 'ArrowUp':
      return 'up';
    case 'ArrowDown':
      return 'down';
    case 'Enter':
    case ' ':
      return 'confirm';
    case 'Escape':
    case 'Backspace':
      return 'back';
    default:
      return null;
  }
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
