import type { PreloadPreparationSnapshot } from '@miauflix/backend';
import { PALETTE } from '@shared/config/constants';
import { type FC } from 'react';
import styled from 'styled-components';

import SparklesIcon from '~icons/ion/sparkles';
import AlertIcon from '~icons/line-md/alert';
import LoadingIcon from '~icons/mdi/loading';

type MediaKind = 'movie' | 'tvshow';
export type SourcePreparationMode = 'browse' | 'details';

export interface SourcePreparationStatusProps {
  mediaKind: MediaKind;
  mode: SourcePreparationMode;
  preparation: PreloadPreparationSnapshot | null;
}

const Status = styled.div`
  display: flex;
  flex: 0 1 auto;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.55rem 0.75rem;
  min-width: max-content;
  min-height: 1.8rem;
  margin: 0;
  color: ${PALETTE.text.secondary};
  font-size: clamp(0.76rem, 1.8vh, 1rem);

  @media (max-width: 860px) {
    width: 100%;
    min-width: 0;
    align-items: flex-start;
  }
`;

const Badges = styled.div`
  display: flex;
  align-items: center;
  gap: 0.55rem;
`;

const QualityBadge = styled.span<{ $state: 'clean' | 'warning' | 'unknown' }>`
  display: inline-flex;
  align-items: center;
  min-height: 1.65rem;
  padding: 0.15rem 0.58rem;
  border: 1px solid
    ${({ $state }) =>
      $state === 'clean'
        ? 'rgba(236, 188, 41, 0.72)'
        : $state === 'warning'
          ? 'rgba(166, 173, 175, 0.32)'
          : PALETTE.background.border};
  border-radius: 0.35rem;
  background: ${({ $state }) =>
    $state === 'clean'
      ? 'rgba(91, 67, 7, 0.34)'
      : $state === 'warning'
        ? 'rgba(46, 51, 53, 0.74)'
        : 'rgba(17, 23, 25, 0.86)'};
  color: ${({ $state }) =>
    $state === 'clean'
      ? '#ffe17a'
      : $state === 'warning'
        ? PALETTE.text.disabled
        : PALETTE.text.secondary};
  font-size: 1em;
  font-weight: 650;
  letter-spacing: 0.025em;
  white-space: nowrap;
`;

const Sparkles = styled.span`
  margin-right: 0.38rem;
  color: #ffe17a;
  font-size: 1.5em;
  line-height: 1;
  letter-spacing: -0.16em;
`;

const VisuallyHidden = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
`;

const Discovery = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
`;

const Warmup = styled(Discovery)`
  color: ${PALETTE.text.primary};
`;

const Loading = styled(LoadingIcon)`
  flex: 0 0 auto;
  animation: status-spin 1s linear infinite;

  @keyframes status-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const Warning = styled.span`
  display: inline-flex;
  align-items: center;
  color: ${PALETTE.color.warning};
`;

const WarningIcon = styled(AlertIcon)`
  width: 1.15em;
  height: 1.15em;
`;

function matchesMedia(snapshot: PreloadPreparationSnapshot | null, mediaKind: MediaKind): boolean {
  if (!snapshot) return true;
  return mediaKind === 'movie' && snapshot.playable.kind === 'movie';
}

type SourceMetadata = NonNullable<PreloadPreparationSnapshot['source']>;
type Quality = SourceMetadata['quality'];
type SourceType = SourceMetadata['sourceType'];
type WarmupState = PreloadPreparationSnapshot['warmup']['state'];

function qualityLabel(quality: Quality): string | null {
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

function sourceLabel(sourceType: SourceType): string | null {
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

function sourceQualityState(sourceType: SourceType): 'clean' | 'warning' | 'unknown' {
  if (sourceType === 'CAM' || sourceType === 'TS') return 'warning';
  if (sourceType) return 'clean';
  return 'unknown';
}

function discoveryText(state: PreloadPreparationSnapshot['state']): string | null {
  switch (state) {
    case 'source_found':
      return 'Source found';
    case 'no_source':
      return 'No compatible source found yet';
    case 'error':
      return 'Source discovery failed';
    case 'unknown':
      return null;
    case 'checking':
    default:
      return 'Checking sources';
  }
}

function warmupText(state: WarmupState): { text: string; loading: boolean } | null {
  switch (state) {
    case 'warming':
      return { text: 'Warming up torrent…', loading: true };
    case 'ready':
      return { text: 'Initial buffer ready', loading: false };
    case 'paused':
      return { text: 'Paused', loading: false };
    case 'failed':
      return { text: 'Torrent warmup failed', loading: false };
    case 'not_requested':
    default:
      return null;
  }
}

/** Shows discovery state and the source metadata already known by preload. */
export const SourcePreparationStatus: FC<SourcePreparationStatusProps> = ({
  mediaKind,
  mode,
  preparation,
}) => {
  if (mediaKind !== 'movie') return null;
  if (preparation && !matchesMedia(preparation, mediaKind)) return null;

  const source = preparation?.source;
  const quality = qualityLabel(source?.quality ?? null);
  const release = sourceLabel(source?.sourceType ?? null);
  const qualityState = sourceQualityState(source?.sourceType ?? null);
  const warmup =
    mode === 'details' ? warmupText(preparation?.warmup?.state ?? 'not_requested') : null;
  const discovery = discoveryText(preparation?.state ?? 'checking');
  const loading = !preparation || preparation.state === 'checking';
  const showDiscovery =
    loading ||
    (preparation?.state !== 'source_found' && Boolean(discovery)) ||
    (preparation?.state === 'source_found' && !quality && !release);
  const warning = release === 'CAM' || release === 'TS';

  return (
    <Status aria-live="polite">
      {showDiscovery && discovery && (
        <Discovery>
          {loading && <Loading width="1.1em" height="1.1em" aria-hidden="true" />}
          <span>{discovery}</span>
        </Discovery>
      )}
      {(quality || release) && (
        <Badges>
          {quality && (
            <QualityBadge
              $state={qualityState}
              aria-label={`${quality}${release ? `, ${release} source` : ''}${
                qualityState === 'warning' ? ', lower audio and video quality' : ''
              }`}
            >
              {qualityState === 'clean' && (
                <Sparkles aria-hidden="true">
                  <SparklesIcon />
                </Sparkles>
              )}
              {quality}
              {release && <VisuallyHidden>{release}</VisuallyHidden>}
            </QualityBadge>
          )}
          {warning && (
            <Warning
              role="img"
              aria-label={`${release} release may have lower audio and video quality.`}
              title={`${release} release may have lower audio and video quality.`}
            >
              <WarningIcon aria-hidden="true" />
            </Warning>
          )}
        </Badges>
      )}
      {warmup && (
        <Warmup>
          {warmup.loading && <Loading width="1.1em" height="1.1em" aria-hidden="true" />}
          <span>{warmup.text}</span>
        </Warmup>
      )}
    </Status>
  );
};
