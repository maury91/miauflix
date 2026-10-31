import type { MediaDto } from '@miauflix/backend';
import { builtForTizen } from '@shared/config/constants';

export function getMediaTitle(media: MediaDto): string {
  return media._type === 'movie' ? media.title : media.name;
}

/** Runtime in minutes as `2h 11m`, `2h` or `45m`. */
export function formatRuntime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (!hours) return `${rest}m`;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export function getImageUrl(path: string | null | undefined, size = 'w500'): string {
  if (!path) return '';
  const isBundledAsset =
    path.startsWith('/src/') || path.startsWith('/assets/') || path.startsWith('/@fs/');
  // The catalog returns URLs on the provider's configured image base (a local mock in E2E);
  // keep the host and only choose the size.
  if (/^https?:\/\/[^/]+\/t\/p\/[^/]+\//u.test(path)) {
    return path.replace(/(\/t\/p\/)[^/]+\//u, `$1${size}/`);
  }
  return path.startsWith('/') && !isBundledAsset
    ? `https://image.tmdb.org/t/p/${size}${path}`
    : path;
}

/** Size artwork for its rendered width; keep provider and bundled asset URLs intact. */
export function artworkUrl(
  path: string | null | undefined,
  kind: 'card' | 'logo' | 'backdrop' | 'still',
  cssWidth = typeof window === 'undefined' ? 1280 : window.innerWidth
): string {
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  const pixels = Math.max(1, cssWidth) * dpr;
  const size =
    kind === 'still'
      ? 'w300'
      : kind === 'logo'
        ? pixels <= 300
          ? 'w300'
          : 'w500'
        : kind === 'card'
          ? pixels <= 300
            ? 'w300'
            : 'w780'
          : // A TV takes about half a second to decode an original (often 4K) backdrop
            pixels <= 1280 || builtForTizen
            ? 'w1280'
            : 'original';
  return getImageUrl(path, size);
}
