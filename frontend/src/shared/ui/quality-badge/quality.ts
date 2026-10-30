import type { PreloadPreparationSnapshot } from '@miauflix/backend';

type SourceMetadata = NonNullable<PreloadPreparationSnapshot['source']>;
// Plain string unions: the backend's enums are assignable to them, and fixtures can use literals.
export type SourceQuality = `${NonNullable<SourceMetadata['quality']>}`;
export type SourceReleaseType = `${NonNullable<SourceMetadata['sourceType']>}`;
export type QualityState = 'clean' | 'warning' | 'unknown';

export function qualityLabel(quality: SourceQuality | null): string | null {
  switch (quality) {
    case '8K':
      return '8K';
    case '4K':
      return '4K';
    case '2K':
      return '2K';
    case 'FHD':
      return '1080p';
    case 'HD':
      return '720p';
    case 'SD':
      return 'SD';
    case '3D':
      return '3D';
    default:
      return null;
  }
}

export function sourceLabel(sourceType: SourceReleaseType | null): string | null {
  switch (sourceType) {
    case 'WEB':
      return 'WEB';
    case 'BLURAY':
      return 'Blu-ray';
    case 'HDTV':
      return 'HDTV';
    case 'DVD':
      return 'DVD';
    case 'TS':
      return 'TS';
    case 'CAM':
      return 'CAM';
    case 'DCP':
      return 'DCP';
    default:
      return null;
  }
}

export function sourceQualityState(sourceType: SourceReleaseType | null): QualityState {
  if (sourceType === 'CAM' || sourceType === 'TS') return 'warning';
  if (sourceType) return 'clean';
  return 'unknown';
}

/** Accessible description of a quality badge, e.g. "1080p, Blu-ray source". */
export function qualityDescription(
  label: string | null,
  sourceType: SourceReleaseType | null
): string | null {
  const release = sourceLabel(sourceType);
  if (!label) return release ? `${release} source` : null;
  return `${label}${release ? `, ${release} source` : ''}${
    sourceQualityState(sourceType) === 'warning' ? ', lower audio and video quality' : ''
  }`;
}
