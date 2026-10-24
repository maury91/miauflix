import type { MediaDto } from '@miauflix/backend';

export function getMediaTitle(media: MediaDto): string {
  return media._type === 'movie' ? media.title : media.name;
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
          : pixels <= 1280
            ? 'w1280'
            : 'original';
  return getImageUrl(path, size);
}
