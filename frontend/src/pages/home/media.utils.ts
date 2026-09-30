import type { MediaDto } from '@miauflix/backend';

export function getMediaTitle(media: MediaDto): string {
  return media._type === 'movie' ? media.title : media.name;
}

export function getImageUrl(path: string | null | undefined, size = 'w500'): string {
  if (!path) return '';
  const isBundledAsset =
    path.startsWith('/src/') || path.startsWith('/assets/') || path.startsWith('/@fs/');
  return path.startsWith('/') && !isBundledAsset
    ? `https://image.tmdb.org/t/p/${size}${path}`
    : path;
}
