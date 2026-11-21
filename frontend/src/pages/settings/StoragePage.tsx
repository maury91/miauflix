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
import { type MessageKey, t as translate, useT } from '@shared/i18n';
import { getImageUrl } from '@shared/lib/media.utils';
import { useMemo, useState } from 'react';

import {
  computeUsage,
  formatBytes,
  sortItems,
  sortOptions,
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

const KIND_LABELS: Record<StorageItemView['kind'], MessageKey | null> = {
  movie: 'storage.kind.movie',
  episode: 'storage.kind.episode',
  anime: 'storage.kind.anime',
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
  return translate('storage.freeFailed');
}

function statusLabel(activity: StorageItemView['activity']): string {
  switch (activity) {
    case 'active':
    case 'available_offline':
    case 'local_only':
    case 'inactive':
      return translate(`storage.status.${activity}`);
    default:
      return translate('storage.status.unknown');
  }
}

export default function StoragePage({ onDismiss }: StoragePageProps) {
  const t = useT();
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
      ? t('storage.seedingConfigured')
      : describeDuration(savedSeeding) === null
        ? t('storage.seedingNone')
        : t('storage.seedingFor', { duration: describeDuration(savedSeeding)! });
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
      setNotice(
        t('storage.freed', { size: formatBytes(item.physicalBytes), name: itemName(item) })
      );
    } catch (requestError) {
      setDialogError(storageErrorMessage(requestError));
    }
  };

  const confirmedItem = data?.items.find(item => item.sourceId === confirmingId);
  const retry = (
    <ActionGroup>
      <Button navId={STORAGE_NAV.retry} onClick={() => void refetch()}>
        {t('common.tryAgain')}
      </Button>
    </ActionGroup>
  );

  return (
    <SettingsLayout
      title={t('storage.title')}
      description={t('storage.description')}
      onBack={onDismiss}
      backLabel={t('storage.back')}
      width="full"
      overlay={
        <Dialog
          open={confirmedItem !== undefined}
          title={confirmedItem ? t('storage.confirmTitle', { name: itemName(confirmedItem) }) : ''}
          description={
            confirmedItem
              ? t('storage.confirmDescription', { size: formatBytes(confirmedItem.physicalBytes) })
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
                {t('common.cancel')}
              </Button>
              <Button
                navId={STORAGE_NAV.confirm}
                loading={removal.isLoading}
                onClick={() => confirmedItem && void confirmRemoval(confirmedItem)}
              >
                {t('storage.deleteDownload')}
              </Button>
            </>
          }
        >
          {dialogError && (
            <Message tone="danger" toneLabel={t('common.error')} live="assertive">
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
          {notice || (isFetching && !isLoading ? t('storage.updating') : '')}
        </Text>
      </div>

      {(isLoading || error) && (
        <div className={styles.section}>
          {isLoading && <ProgressSpinner label={t('storage.loading')} />}
          {!isLoading && error && (
            <Message tone="danger" toneLabel={t('common.error')} live="assertive" actions={retry}>
              {data ? t('storage.refreshFailed') : t('storage.loadFailed')}
            </Message>
          )}
        </div>
      )}

      {data && (
        <Section
          title={t('storage.downloads')}
          actions={
            data.items.length > 1 ? (
              <div className={styles.sort}>
                <span aria-hidden="true">
                  <Text tone="secondary">{t('storage.sortBy')}</Text>
                </span>
                <Select
                  navId={STORAGE_NAV.sort}
                  label={t('storage.sortBy')}
                  labelHidden
                  items={sortOptions()}
                  value={sort}
                  onChange={value => setSort(value as StorageSort)}
                />
              </div>
            ) : undefined
          }
        >
          {data.items.length === 0 ? (
            <Text tone="secondary">{t('storage.empty')}</Text>
          ) : (
            <List label={t('storage.list')} divided>
              {items.map(item => (
                <ListItem
                  key={item.sourceId}
                  navId={`storage-item:${item.sourceId}`}
                  leading={<Thumbnail item={item} />}
                  title={item.title}
                  metadata={
                    KIND_LABELS[item.kind] ? <Badge>{t(KIND_LABELS[item.kind]!)}</Badge> : undefined
                  }
                  description={<ItemDetails item={item} />}
                  trailing={
                    <IconButton
                      navId={STORAGE_NAV.free(item.sourceId)}
                      label={t('storage.freeLabel', { name: itemName(item) })}
                      tooltip={t(
                        item.activeStreams > 0 ? 'storage.beingWatched' : 'storage.freeSpace'
                      )}
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
              {t('storage.legend', { seeding })}
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
  const t = useT();
  const facts = [
    item.quality,
    formatBytes(item.physicalBytes),
    statusLabel(item.activity),
    item.videoComplete
      ? t('storage.videoComplete')
      : t('storage.percentDownloaded', { percent: Math.round(item.progressPercent) }),
  ].filter(Boolean);
  return (
    <span className={styles.details}>
      {item.subtitle && <span>{item.subtitle}</span>}
      <span>
        {facts.join(' · ')}
        {item.activeStreams > 0 ? ` · ${t('storage.currentlyWatched')}` : ''}
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
        {t('storage.reserved', { size: formatBytes(item.reservedBytes) })}
        {item.remuxBytes > 0
          ? ` · ${t('storage.tvRemux', { size: formatBytes(item.remuxBytes) })}`
          : ''}
        {item.activity === 'available_offline' && item.seedEndsAt
          ? ` · ${t(item.torrentLoaded ? 'storage.torrentLoadedUntil' : 'storage.torrentMayReloadUntil', { date: new Date(item.seedEndsAt).toLocaleString(t('meta.locale')) })}`
          : ''}
      </span>
    </span>
  );
}
