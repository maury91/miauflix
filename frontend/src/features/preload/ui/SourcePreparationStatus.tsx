import type { PreloadPreparationSnapshot } from '@miauflix/backend';
import { builtForTizen, PALETTE } from '@shared/config/constants';
import { LoadingIndicator } from '@shared/ui/loading-indicator/LoadingIndicator';
import { qualityLabel } from '@shared/ui/quality-badge/quality';
import { QualityBadge } from '@shared/ui/quality-badge/QualityBadge';
import { type FC } from 'react';
import styled from 'styled-components';

import LoadingIcon from '~icons/mdi/loading';
import NoSourceIcon from '~icons/mdi/video-off-outline';

type MediaKind = 'movie' | 'tvshow';
export type SourcePreparationMode = 'browse' | 'details';

export interface SourcePreparationStatusProps {
  mediaKind: MediaKind;
  mode: SourcePreparationMode;
  preparation: PreloadPreparationSnapshot | null;
  /** Pushed or fetched availability; `unavailable` replaces the quality with a no-source badge. */
  availability?: 'available' | 'pending' | 'unavailable' | null;
}

const Status = styled.div`
  display: flex;
  flex: 0 1 auto;
  flex-direction: column;
  align-items: flex-end;
  gap: 8.8px 12px;
  min-width: max-content;
  min-height: 28.8px;
  margin: 0;
  color: ${PALETTE.text.secondary};
  font-size: clamp(12.16px, 1.8vh, 16px);

  @media (max-width: 860px) {
    width: 100%;
    min-width: 0;
    align-items: flex-start;
  }
`;

const NoSourceBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6.08px;
  min-height: 26.4px;
  padding: 2.4px 9.28px;
  border: 1px solid ${PALETTE.background.border};
  border-radius: 5.6px;
  background: rgba(17, 23, 25, 0.86);
  color: ${PALETTE.text.disabled};
  font-size: 1em;
  font-weight: 650;
  letter-spacing: 0.025em;
  white-space: nowrap;

  svg {
    width: 1.15em;
    height: 1.15em;
  }
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
  gap: 6.4px;
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

function matchesMedia(snapshot: PreloadPreparationSnapshot | null, mediaKind: MediaKind): boolean {
  if (!snapshot) return true;
  return mediaKind === 'movie' && snapshot.playable.kind === 'movie';
}

/** Shows discovery state and the source metadata already known by preload. */
export const SourcePreparationStatus: FC<SourcePreparationStatusProps> = ({
  mediaKind,
  preparation,
  availability,
}) => {
  if (mediaKind !== 'movie') return null;
  if (preparation && !matchesMedia(preparation, mediaKind)) return null;

  const unavailable =
    availability === 'unavailable' ||
    (availability !== 'available' && preparation?.state === 'unavailable');
  if (unavailable) {
    return (
      <Status aria-live="polite">
        <NoSourceBadge role="img" aria-label="No source available" title="No source available">
          <NoSourceIcon aria-hidden="true" />
          No source
        </NoSourceBadge>
      </Status>
    );
  }

  const source = preparation?.source;
  // Unknown resolution gets a display-only fallback once a source is available.
  const quality = source && source.quality == null ? '720p' : qualityLabel(source?.quality ?? null);
  const loading = !preparation || preparation.state === 'checking';
  const showDiscovery =
    loading ||
    (preparation?.state !== 'source_found' && preparation?.state !== 'unknown') ||
    (preparation?.state === 'source_found' && !quality && !source?.sourceType);

  return (
    <Status aria-live="polite">
      {showDiscovery && (
        <Discovery>
          {loading &&
            (builtForTizen ? (
              // The SVG spin would run on the TV's main thread (see Spinner).
              <LoadingIndicator style={{ fontSize: '1.1em' }} />
            ) : (
              <Loading width="1.1em" height="1.1em" aria-hidden="true" />
            ))}
          {loading && <VisuallyHidden>Checking sources</VisuallyHidden>}
          {preparation?.state === 'error' && (
            <VisuallyHidden>Could not check sources.</VisuallyHidden>
          )}
          {preparation?.state === 'no_source' && (
            <VisuallyHidden>No compatible source found yet</VisuallyHidden>
          )}
        </Discovery>
      )}
      <QualityBadge label={quality} sourceType={source?.sourceType ?? null} />
    </Status>
  );
};
