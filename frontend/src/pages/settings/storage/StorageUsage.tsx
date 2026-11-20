import { Heading, Surface, Text } from '@shared/design-system';

import { formatBytes, type StorageUsage as Usage } from './storageInventory';
import * as styles from './storageUsage.css';

const percent = (share: number) => `${Math.min(100, Math.max(0, share * 100))}%`;

/**
 * The disk at a glance: what each kind of media takes, Miauflix's TV remuxes, everything else on
 * the disk and the free space, with Miauflix's limit marked. The bar itself is decorative: the
 * legend says the same in words.
 */
export function StorageUsage({ usage }: { usage: Usage }) {
  const { totalBytes, segments, usedBytes, freeBytes, limitBytes, chargedBytes } = usage;
  const limitShare = limitBytes === null ? null : Math.min(1, limitBytes / totalBytes);
  return (
    <Surface as="section" border radius="lg" padding="lg" aria-labelledby="storage-usage-title">
      <div className={styles.header}>
        <Heading level={2} variant="heading" id="storage-usage-title">
          {usage.isDisk ? 'Disk usage' : 'Storage usage'}
        </Heading>
        <div className={styles.totals}>
          <Text variant="label">{`${formatBytes(usedBytes)} / ${formatBytes(totalBytes)}`}</Text>
          <Text variant="label" tone="secondary">
            {`${Math.round((usedBytes / totalBytes) * 100)}%`}
          </Text>
        </div>
      </div>
      <div className={styles.meter} aria-hidden="true">
        <div className={styles.track}>
          {segments.map(segment => (
            <span
              key={segment.category}
              className={`${styles.segment} ${styles.swatch[segment.category]}`}
              style={{ width: percent(segment.bytes / totalBytes) }}
            />
          ))}
        </div>
        {limitShare !== null && (
          <span className={styles.limit} style={{ left: percent(limitShare) }}>
            <span className={styles.limitLabel} data-side={limitShare > 0.5 ? 'end' : 'start'}>
              Limit {formatBytes(limitBytes)}
            </span>
          </span>
        )}
      </div>
      <ul className={styles.legend} aria-label="Space by kind">
        {segments.map(segment => (
          <li key={segment.category}>
            <span className={`${styles.legendSwatch} ${styles.swatch[segment.category]}`} />
            <Text variant="caption" tone="secondary">
              {segment.label}
            </Text>
            <span className={styles.legendValue}>
              <Text variant="caption">{formatBytes(segment.bytes)}</Text>
            </span>
          </li>
        ))}
        {freeBytes !== null && (
          <li>
            <span className={`${styles.legendSwatch} ${styles.swatch.free}`} />
            <Text variant="caption" tone="secondary">
              Free
            </Text>
            <span className={styles.legendValue}>
              <Text variant="caption">{formatBytes(freeBytes)}</Text>
            </span>
          </li>
        )}
      </ul>
      {limitBytes !== null && (
        <div className={styles.note}>
          <Text variant="caption" tone="secondary">
            {`Miauflix counts ${formatBytes(chargedBytes)} against its ${formatBytes(limitBytes)} limit, including room reserved for downloads in progress.`}
          </Text>
        </div>
      )}
    </Surface>
  );
}
