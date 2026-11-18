import type { MediaDto } from '@miauflix/backend';
import {
  type CardImageFormat,
  cardImageSizeFor,
  cardImageVersion,
} from '@miauflix/service-contracts/card-image/v1';
import { API_URL, builtForTizen } from '@shared/config/constants';
import { getTvHeroBackdropSizes } from '@shared/config/tv-profile';

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
  /** `backdrop` while the selection moves, `backdrop-resting` once it rests (the TV sizes them). */
  kind: 'card' | 'logo' | 'backdrop' | 'backdrop-resting' | 'still',
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
            ? getTvHeroBackdropSizes()[kind === 'backdrop' ? 'moving' : 'resting']
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

/**
 * The TV decodes every image it paints in software, and decodes a baseline JPEG card image in about
 * 6 ms against 10 for WebP (docs/development/tv-benchmarks.md, 2026-11-17); browsers get the
 * smaller WebP.
 */
const CARD_IMAGE_FORMAT: CardImageFormat = builtForTizen ? 'jpeg' : 'webp';
const CARD_IMAGE_EXTENSION: Record<CardImageFormat, string> = { jpeg: 'jpg', webp: 'webp' };

/**
 * A title's card image from the backend: its backdrop with the logo (or the name) drawn in, at the
 * smallest size covering `cssWidth`. `revision` (the media's `artworkRevision`) and the drawing's layout version the URL.
 */
export function cardImageUrl(
  mediaType: 'movie' | 'tv',
  mediaId: number,
  revision: number,
  cssWidth: number
): string {
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  const size = cardImageSizeFor(Math.max(1, cssWidth) * dpr);
  const base = API_URL.replace(/\/+$/u, '');
  return `${base}/api/artwork/card/${mediaType}/${mediaId}/${size}.${CARD_IMAGE_EXTENSION[CARD_IMAGE_FORMAT]}?rev=${cardImageVersion(revision)}`;
}
