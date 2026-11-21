import { Heading, Surface, Text } from '@shared/design-system';
import type { ReactNode } from 'react';

import { formatBytes, type StorageUsage as Usage, type UsageSegment } from './storageInventory';
import * as styles from './storageUsage.css';

const percent = (share: number) => `${Math.min(100, Math.max(0, share * 100))}%`;

/**
 * The disk at a glance: what each kind of media takes and Miauflix's TV remuxes from the start,
 * then the room kept for playback and the free space, with Miauflix's limit marked, and last
 * everything else on the disk, which Miauflix doesn't control. The bar itself is decorative: the legend says the same in words.
 */
export function StorageUsage({ usage }: { usage: Usage }) {
  const { totalBytes, segments, usedBytes, freeBytes, limitBytes, reserveBytes, chargedBytes } =
    usage;
  const limitShare = limitBytes === null ? null : Math.min(1, limitBytes / totalBytes);
  const miauflix = segments.filter(segment => segment.category !== 'other');
  const other = segments.find(segment => segment.category === 'other');
  // The playback reserve is free space held back: drawn next to Miauflix's data, so the rest of
  // the free space stays one stretch, with the limit marked in it
  const shownReserve = reserveBytes === null ? 0 : Math.min(reserveBytes, freeBytes ?? Infinity);
  const shownFree = freeBytes === null ? null : freeBytes - shownReserve;
  const bar = (segment: UsageSegment) => (
    <span
      key={segment.category}
      className={`${styles.segment} ${styles.swatch[segment.category]}`}
      style={{ width: percent(segment.bytes / totalBytes) }}
    />
  );
  const legend = (segment: UsageSegment) => (
    <LegendItem
      key={segment.category}
      swatch={styles.swatch[segment.category]}
      label={segment.label}
      bytes={segment.bytes}
    />
  );
  return (
    <Surface as="section" border radius="lg" padding="lg" aria-labelledby="storage-usage-title">
      <div className={styles.header}>
        <Heading level={2} variant="heading" id="storage-usage-title">
          {usage.isDisk ? 'Disk usage' : 'Storage usage'}
        </Heading>
        <div className={styles.totals}>
          {usedBytes === null ? (
            <Text variant="label" tone="secondary">
              Usage unavailable
            </Text>
          ) : (
            <>
              <Text variant="label">{`${formatBytes(usedBytes)} / ${formatBytes(totalBytes)}`}</Text>
              <Text variant="label" tone="secondary">
                {`${Math.round((usedBytes / totalBytes) * 100)}%`}
              </Text>
            </>
          )}
        </div>
      </div>
      <div className={styles.meter} aria-hidden="true">
        <div className={styles.track}>
          {miauflix.map(bar)}
          {shownReserve > 0 && (
            <span
              className={`${styles.segment} ${styles.reserve}`}
              style={{ width: percent(shownReserve / totalBytes) }}
            />
          )}
          <span className={styles.freeSpace} />
          {other && bar(other)}
        </div>
        {limitShare !== null && (
          <span className={styles.limit} style={{ left: percent(limitShare) }}>
            <span className={styles.limitLabel} data-side={limitShare > 0.5 ? 'end' : 'start'}>
              Limit {formatBytes(limitBytes)}
              {usage.limitDraft ? ' (not saved)' : ''}
            </span>
          </span>
        )}
      </div>
      <ul className={styles.legend} aria-label="Space by kind">
        {miauflix.map(legend)}
        {shownReserve > 0 && (
          <LegendItem
            swatch={styles.reserveSwatch}
            label="Reserved for playback"
            bytes={shownReserve}
          />
        )}
        {shownFree !== null && (
          <LegendItem swatch={styles.swatch.free} label="Free" bytes={shownFree} />
        )}
        {other && legend(other)}
      </ul>
      {limitBytes !== null && (
        <div className={styles.note}>
          <Text variant="caption" tone="secondary">
            {`Miauflix counts ${formatBytes(chargedBytes)} against its ${formatBytes(limitBytes)} limit, including room reserved for downloads in progress.`}
            {reserveBytes !== null && reserveBytes < limitBytes
              ? ` Downloads made ahead of time stop at ${formatBytes(limitBytes - reserveBytes)}, keeping the rest for playback.`
              : ''}
          </Text>
        </div>
      )}
    </Surface>
  );
}

function LegendItem({ swatch, label, bytes }: { swatch: string; label: ReactNode; bytes: number }) {
  return (
    <li>
      <span className={`${styles.legendSwatch} ${swatch}`} />
      <Text variant="caption" tone="secondary">
        {label}
      </Text>
      <span className={styles.legendValue}>
        <Text variant="caption">{formatBytes(bytes)}</Text>
      </span>
    </li>
  );
}
