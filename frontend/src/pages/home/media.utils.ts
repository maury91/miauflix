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

/** Home asks for the same few hundred URLs on every move; building them is regex work. */
const artworkUrls = new Map<string, string>();
const MAX_CACHED_ARTWORK_URLS = 5_000;

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
        : // The TV rasterizes in software and decodes every image it paints: the smallest sizes
          // that still look right from the sofa keep its moves smooth (a w780 card took ~95 ms).
          kind === 'card'
          ? pixels <= 300 || builtForTizen
            ? 'w300'
            : 'w780'
          : builtForTizen
            ? 'w780'
            : pixels <= 1280
              ? 'w1280'
              : 'original';
  if (!path) return '';
  const key = `${size}|${path}`;
  let url = artworkUrls.get(key);
  if (url === undefined) {
    if (artworkUrls.size >= MAX_CACHED_ARTWORK_URLS) artworkUrls.clear();
    url = getImageUrl(path, size);
    artworkUrls.set(key, url);
  }
  return url;
}
