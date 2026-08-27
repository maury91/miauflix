export type NavigationResult =
  | { type: 'media'; index: number }
  | { type: 'category'; delta: -1 | 1 }
  | null;

export function getNavigationResult(key: string, current: number, total: number): NavigationResult {
  switch (key) {
    case 'ArrowLeft':
      return { type: 'media', index: Math.max(0, current - 1) };
    case 'ArrowRight':
      return { type: 'media', index: Math.min(total - 1, current + 1) };
    case 'Home':
      return { type: 'media', index: 0 };
    case 'End':
      return { type: 'media', index: Math.max(0, total - 1) };
    case 'ArrowUp':
      return { type: 'category', delta: -1 };
    case 'ArrowDown':
      return { type: 'category', delta: 1 };
    default:
      return null;
  }
}
