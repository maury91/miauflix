import type { PreloadPreparationSnapshot } from '@miauflix/backend';
import { Badge, ProgressSpinner } from '@shared/design-system';
import { visuallyHidden } from '@shared/design-system/a11y.css';
import {
  qualityDescription,
  qualityLabel,
  sourceLabel,
  sourceQualityState,
  type SourceReleaseType,
} from '@shared/lib/source-quality';
import { type FC } from 'react';

import * as styles from './sourcePreparationStatus.css';

import SparklesIcon from '~icons/ion/sparkles';
import AlertIcon from '~icons/line-md/alert';
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

/**
 * The resolution (sparkles for a clean release) and, for CAM/TS releases, a warning badge naming
 * the release.
 */
function QualityBadges({
  label,
  sourceType,
}: {
  label: string | null;
  sourceType: SourceReleaseType | null;
}) {
  const release = sourceLabel(sourceType);
  const state = sourceQualityState(sourceType);
  const warning = state === 'warning';
  if (!label && !warning) return null;
  const warningText = `${release} release may have lower audio and video quality.`;
  return (
    <span className={styles.badges}>
      {label && (
        <Badge
          tone={state === 'clean' ? 'premium' : 'neutral'}
          icon={state === 'clean' ? <SparklesIcon /> : undefined}
          accessibleLabel={qualityDescription(label, sourceType) ?? undefined}
        >
          {label}
        </Badge>
      )}
      {warning && release && (
        <span role="img" aria-label={warningText} title={warningText}>
          <Badge tone="warning" icon={<AlertIcon />}>
            {release}
          </Badge>
        </span>
      )}
    </span>
  );
}

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
      <div className={styles.status} aria-live="polite">
        <span role="img" aria-label="No source available" title="No source available">
          <Badge icon={<NoSourceIcon />}>No source</Badge>
        </span>
      </div>
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
    <div className={styles.status} aria-live="polite">
      {showDiscovery && (
        <span className={styles.discovery}>
          {loading && <ProgressSpinner size="sm" label="Checking sources" />}
          {preparation?.state === 'error' && (
            <span className={visuallyHidden}>Could not check sources.</span>
          )}
          {preparation?.state === 'no_source' && (
            <span className={visuallyHidden}>No compatible source found yet</span>
          )}
        </span>
      )}
      <QualityBadges label={quality} sourceType={source?.sourceType ?? null} />
    </div>
  );
};
