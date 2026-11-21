import {
  useGetStorageInventoryQuery,
  useRemoveStorageMutation,
} from '@features/storage/api/storage.api';
import type { StorageItemView } from '@miauflix/backend';
import {
  ActionGroup,
  Artwork,
  Badge,
  Button,
  Dialog,
  IconButton,
  List,
  ListItem,
  Message,
  ProgressSpinner,
  Section,
  Select,
  Text,
} from '@shared/design-system';
import { getImageUrl } from '@shared/lib/media.utils';
import { useMemo, useState } from 'react';

import {
  computeUsage,
  formatBytes,
  SORT_OPTIONS,
  sortItems,
  type StorageSort,
} from './storage/storageInventory';
import { StorageSettings } from './storage/StorageSettings';
import { describeDuration } from './storage/storageSettingsFields';
import { StorageUsage } from './storage/StorageUsage';
import { useStorageSettings } from './storage/useStorageSettings';
import { SettingsLayout } from './SettingsLayout';
import * as styles from './storagePage.css';

import DeleteIcon from '~icons/mdi/delete-outline';
import MovieIcon from '~icons/mdi/movie-open-outline';
import ShowIcon from '~icons/mdi/television-classic';

const STORAGE_NAV = {
  retry: 'storage-retry',
  sort: 'storage-sort',
  free: (sourceId: number) => `storage-free:${sourceId}`,
  cancel: 'storage-cancel',
  confirm: 'storage-confirm',
} as const;

const KIND_LABELS: Record<StorageItemView['kind'], string | null> = {
  movie: 'Movie',
  episode: 'Episode',
  anime: 'Anime',
  unknown: null,
};

interface StoragePageProps {
  onDismiss: () => void;
}

function storageErrorMessage(error: unknown): string {
  const data = (error as { data?: unknown } | undefined)?.data;
  if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
    return data.error;
  }
  return 'Could not free this download. Please try again.';
}

function statusLabel(activity: StorageItemView['activity']): string {
  switch (activity) {
    case 'active':
      return 'Active';
    case 'available_offline':
      return 'Available offline';
    case 'local_only':
      return 'Local only';
    case 'inactive':
      return 'Inactive';
    default:
      return 'Unknown';
  }
}

export default function StoragePage({ onDismiss }: StoragePageProps) {
  const { data, error, isLoading, isFetching, refetch } = useGetStorageInventoryQuery(undefined, {
    pollingInterval: 5_000,
  });
  const [removeStorage, removal] = useRemoveStorageMutation();
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  const [dialogError, setDialogError] = useState('');
  const [sort, setSort] = useState<StorageSort>('size');
  const settings = useStorageSettings({ onSaved: () => void refetch() });
  const { limitBytes: draftLimit, reserveBytes: draftReserve } = settings.draft;
  const usage = useMemo(
    () =>
      data ? computeUsage(data, { limitBytes: draftLimit, reserveBytes: draftReserve }) : null,
    [data, draftLimit, draftReserve]
  );
  const savedSeeding = settings.entries.find(
    entry => entry.key === 'CONTENT_SEED_DURATION_SECONDS'
  )?.value;
  const seeding =
    savedSeeding === undefined
      ? 'Completed downloads seed for the configured time before becoming local only.'
      : describeDuration(savedSeeding) === null
        ? 'Completed downloads become local only right away.'
        : `Completed downloads seed for ${describeDuration(savedSeeding)} before becoming local only.`;
  const items = useMemo(() => (data ? sortItems(data.items, sort) : []), [data, sort]);

  const openConfirmation = (item: StorageItemView) => {
    setNotice('');
    setDialogError('');
    setConfirmingId(item.sourceId);
  };

  const closeConfirmation = () => {
    if (removal.isLoading) return;
    setConfirmingId(null);
    setDialogError('');
  };

  const confirmRemoval = async (item: StorageItemView) => {
    setDialogError('');
    try {
      await removeStorage(item.sourceId).unwrap();
      setConfirmingId(null);
      setNotice(`Freed ${formatBytes(item.physicalBytes)} used by ${itemName(item)}.`);
    } catch (requestError) {
      setDialogError(storageErrorMessage(requestError));
    }
  };

  const confirmedItem = data?.items.find(item => item.sourceId === confirmingId);
  const retry = (
    <ActionGroup>
      <Button navId={STORAGE_NAV.retry} onClick={() => void refetch()}>
        Try again
      </Button>
    </ActionGroup>
  );

  return (
    <SettingsLayout
      title="Storage"
      description="What Miauflix keeps on this server’s disk. Free space to remove a download."
      onBack={onDismiss}
      backLabel="Back to Home"
      width="full"
      overlay={
        <Dialog
          open={confirmedItem !== undefined}
          title={confirmedItem ? `Free space used by ${itemName(confirmedItem)}?` : ''}
          description={
            confirmedItem
              ? `This deletes ${formatBytes(confirmedItem.physicalBytes)} from this server. Future playback will require downloading it again.`
              : undefined
          }
          size="sm"
          onDismiss={closeConfirmation}
          actions={
            <>
              <Button
                navId={STORAGE_NAV.cancel}
                disabled={removal.isLoading}
                onClick={closeConfirmation}
              >
                Cancel
              </Button>
              <Button
                navId={STORAGE_NAV.confirm}
                loading={removal.isLoading}
                onClick={() => confirmedItem && void confirmRemoval(confirmedItem)}
              >
                Delete download
              </Button>
            </>
          }
        >
          {dialogError && (
            <Message tone="danger" toneLabel="Error" live="assertive">
              {dialogError}
            </Message>
          )}
        </Dialog>
      }
    >
      {usage && <StorageUsage usage={usage} />}

      <div className={styles.settings}>
        <StorageSettings form={settings} capacityBytes={usage?.capacityBytes ?? null} />
      </div>

      <div className={styles.status} role="status" aria-live="polite">
        <Text variant="caption" tone="secondary">
          {notice || (isFetching && !isLoading ? 'Updating storage…' : '')}
        </Text>
      </div>

      {(isLoading || error) && (
        <div className={styles.section}>
          {isLoading && <ProgressSpinner label="Loading storage…" />}
          {!isLoading && error && (
            <Message tone="danger" toneLabel="Error" live="assertive" actions={retry}>
              {data
                ? 'Could not refresh storage. Showing the last loaded results.'
                : 'Could not load storage. Check your connection and try again.'}
            </Message>
          )}
        </div>
      )}

      {data && (
        <Section
          title="Downloads"
          actions={
            data.items.length > 1 ? (
              <div className={styles.sort}>
                <span aria-hidden="true">
                  <Text tone="secondary">Sort by</Text>
                </span>
                <Select
                  navId={STORAGE_NAV.sort}
                  label="Sort by"
                  labelHidden
                  items={SORT_OPTIONS}
                  value={sort}
                  onChange={value => setSort(value as StorageSort)}
                />
              </div>
            ) : undefined
          }
        >
          {data.items.length === 0 ? (
            <Text tone="secondary">No downloaded content is using storage.</Text>
          ) : (
            <List label="Downloaded content" divided>
              {items.map(item => (
                <ListItem
                  key={item.sourceId}
                  navId={`storage-item:${item.sourceId}`}
                  leading={<Thumbnail item={item} />}
                  title={item.title}
                  metadata={
                    KIND_LABELS[item.kind] ? <Badge>{KIND_LABELS[item.kind]!}</Badge> : undefined
                  }
                  description={<ItemDetails item={item} />}
                  trailing={
                    <IconButton
                      navId={STORAGE_NAV.free(item.sourceId)}
                      label={`Free space used by ${itemName(item)}`}
                      tooltip={item.activeStreams > 0 ? 'Being watched' : 'Free space'}
                      icon={<DeleteIcon />}
                      disabled={item.activeStreams > 0 || removal.isLoading}
                      onClick={() => openConfirmation(item)}
                    />
                  }
                />
              ))}
            </List>
          )}
          <div className={styles.legend}>
            <Text variant="caption" tone="secondary">
              Inactive is incomplete and not loaded; Active is incomplete and loaded by the torrent.
              Available offline means the video is complete but its torrent may still load. Local
              only means it is complete and will never be loaded by its torrent again. {seeding}{' '}
              Free space deletes a download; you’ll need to download it again before future
              playback.
            </Text>
          </div>
        </Section>
      )}
    </SettingsLayout>
  );
}

/** The title and, for a show, which episodes: names the download in labels and messages. */
function itemName(item: StorageItemView): string {
  return item.kind !== 'movie' && item.subtitle ? `${item.title} (${item.subtitle})` : item.title;
}

function Thumbnail({ item }: { item: StorageItemView }) {
  return (
    <span className={styles.thumbnail}>
      <Artwork
        src={item.image ? getImageUrl(item.image, 'w300') : null}
        ratio="landscape"
        fallback={item.kind === 'movie' ? <MovieIcon /> : <ShowIcon />}
      />
    </span>
  );
}

function ItemDetails({ item }: { item: StorageItemView }) {
  const facts = [
    item.quality,
    formatBytes(item.physicalBytes),
    statusLabel(item.activity),
    item.videoComplete ? 'Video complete' : `${Math.round(item.progressPercent)}% downloaded`,
  ].filter(Boolean);
  return (
    <span className={styles.details}>
      {item.subtitle && <span>{item.subtitle}</span>}
      <span>
        {facts.join(' · ')}
        {item.activeStreams > 0 ? ' · Currently being watched' : ''}
      </span>
      {!item.videoComplete && (
        <span className={styles.progress} aria-hidden="true">
          <span
            className={styles.progressFill}
            style={{ transform: `scaleX(${Math.min(1, Math.max(0, item.progressPercent / 100))})` }}
          />
        </span>
      )}
      <span>
        {item.fileName ? `${item.fileName} · ` : ''}
        {formatBytes(item.reservedBytes)} reserved
        {item.remuxBytes > 0 ? ` · TV remux ${formatBytes(item.remuxBytes)}` : ''}
        {item.activity === 'available_offline' && item.seedEndsAt
          ? ` · Torrent ${item.torrentLoaded ? 'loaded' : 'may reload'} until ${new Date(item.seedEndsAt).toLocaleString()}`
          : ''}
      </span>
    </span>
  );
}
