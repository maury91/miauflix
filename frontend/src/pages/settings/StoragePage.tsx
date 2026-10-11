import {
  useGetStorageInventoryQuery,
  useRemoveStorageMutation,
} from '@features/storage/api/storage.api';
import type { StorageItemView } from '@miauflix/backend';
import { SETTINGS_PALETTE } from '@shared/config/constants';
import { useKeyboardNavigation } from '@shared/hooks/useKeyboardNavigation';
import { ActionRow, Button } from '@shared/ui';
import { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';

const Page = styled.main`
  position: fixed;
  inset: 0;
  z-index: 1000;
  overflow-y: auto;
  background: ${SETTINGS_PALETTE.background.primary};
  color: ${SETTINGS_PALETTE.text.primary};
  font-family: 'Poppins', sans-serif;
`;

const Content = styled.div`
  max-width: 920px;
  margin: 0 auto;
  padding: 132px 24px 40px;

  @media (max-width: 720px) {
    padding: 96px 16px 32px;
  }
`;

const Title = styled.h1`
  margin: 0 0 8px;
  font-size: 28px;
  font-weight: 400;
`;

const Description = styled.p`
  margin: 0 0 24px;
  color: ${SETTINGS_PALETTE.text.secondary};
  font-size: 14px;
  line-height: 1.5;
`;

const Summary = styled.section`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
  margin-bottom: 28px;
`;

const Metric = styled.div`
  min-width: 0;
  padding: 14px;
  border: 1px solid ${SETTINGS_PALETTE.background.border};
  border-radius: 10px;
  background: ${SETTINGS_PALETTE.background.surface};
`;

const MetricLabel = styled.div`
  color: ${SETTINGS_PALETTE.text.secondary};
  font-size: 12px;
`;

const MetricValue = styled.div`
  margin-top: 5px;
  font-size: 18px;
  overflow-wrap: anywhere;
`;

const List = styled.div`
  display: grid;
  gap: 12px;
`;

const Item = styled.article`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  padding: 16px;
  border: 1px solid ${SETTINGS_PALETTE.background.border};
  border-radius: 10px;
  background: ${SETTINGS_PALETTE.background.surface};

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
  }
`;

const ItemTitle = styled.h2`
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  overflow-wrap: anywhere;
`;

const Details = styled.p`
  margin: 5px 0 0;
  color: ${SETTINGS_PALETTE.text.secondary};
  font-size: 13px;
  line-height: 1.5;
  overflow-wrap: anywhere;
`;

const Message = styled.p`
  margin: 16px 0;
  color: ${SETTINGS_PALETTE.text.secondary};
  line-height: 1.5;
`;

const StatusMessage = styled.p`
  min-height: 1.5em;
  margin: 12px 0;
  color: ${SETTINGS_PALETTE.text.secondary};
  font-size: 13px;
`;

const DialogBackdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1001;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgb(0 0 0 / 72%);
`;

const Dialog = styled.div`
  width: min(100%, 440px);
  padding: 24px;
  border: 1px solid ${SETTINGS_PALETTE.background.border};
  border-radius: 12px;
  background: ${SETTINGS_PALETTE.background.surface};
`;

const DialogTitle = styled.h2`
  margin: 0;
  font-size: 20px;
  font-weight: 500;
`;

const DialogActions = styled(ActionRow)`
  justify-content: flex-end;
  margin-top: 20px;
`;

interface StoragePageProps {
  onDismiss: () => void;
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) {
    return 'Unavailable';
  }
  if (bytes === 0) return '0 B';

  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** unitIndex;
  const formattedValue = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(
    value
  );

  return `${formattedValue} ${units[unitIndex]}`;
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
  const buttonRefs = useRef(new Map<number, HTMLButtonElement>());
  const cancelRef = useRef<HTMLButtonElement>(null);
  const previousConfirmingId = useRef<number | null>(null);
  const backRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirmingId !== null) cancelRef.current?.focus({ preventScroll: true });
    else if (previousConfirmingId.current !== null) {
      buttonRefs.current.get(previousConfirmingId.current)?.focus({ preventScroll: true });
    } else backRef.current?.focus({ preventScroll: true });
    previousConfirmingId.current = confirmingId;
  }, [confirmingId]);

  const cycleButtons = (direction: -1 | 1) => {
    const selector =
      confirmingId === null
        ? '[data-storage-page] button:not(:disabled)'
        : '[role="alertdialog"] button:not(:disabled)';
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(selector));
    if (!buttons.length) return true;
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = (index + direction + buttons.length) % buttons.length;
    buttons[next]?.focus({ preventScroll: true });
    return true;
  };

  const navigationRef = useKeyboardNavigation({
    onUp: () => cycleButtons(-1),
    onDown: () => cycleButtons(1),
    onBack: () => {
      if (confirmingId !== null) {
        setConfirmingId(null);
        setDialogError('');
      } else onDismiss();
      return true;
    },
  });

  const openConfirmation = (item: StorageItemView) => {
    setNotice('');
    setDialogError('');
    setConfirmingId(item.movieSourceId);
  };

  const confirmRemoval = async (item: StorageItemView) => {
    setDialogError('');
    try {
      await removeStorage(item.movieSourceId).unwrap();
      setConfirmingId(null);
      setNotice(`Freed ${formatBytes(item.physicalBytes)} used by ${item.title}.`);
    } catch (requestError) {
      setDialogError(storageErrorMessage(requestError));
    }
  };

  const confirmedItem = data?.items.find(item => item.movieSourceId === confirmingId);
  const summary = data?.summary;

  return (
    <Page ref={navigationRef} data-storage-page aria-labelledby="storage-title">
      <Content>
        <Title id="storage-title">Storage</Title>
        <Description>
          Inactive is incomplete and not loaded; Active is incomplete and loaded by the torrent.
          Available offline means the video is complete but its torrent may still load. Local only
          means it is complete and will never be loaded by its torrent again. Completed downloads
          seed for the configured duration before becoming local only. Free space deletes a
          download; you’ll need to download it again before future playback.
        </Description>

        {summary && (
          <Summary aria-label="Storage usage">
            <Metric>
              <MetricLabel>Physical disk usage</MetricLabel>
              <MetricValue>{formatBytes(summary.physicalBytes)}</MetricValue>
            </Metric>
            <Metric>
              <MetricLabel>Storage budget</MetricLabel>
              <MetricValue>{formatBytes(summary.storageBudgetBytes)}</MetricValue>
            </Metric>
            <Metric>
              <MetricLabel>Reserved capacity</MetricLabel>
              <MetricValue>{formatBytes(summary.reservedBytes)}</MetricValue>
            </Metric>
            <Metric>
              <MetricLabel>Charged to budget</MetricLabel>
              <MetricValue>{formatBytes(summary.chargedBytes)}</MetricValue>
            </Metric>
            <Metric>
              <MetricLabel>Filesystem free space</MetricLabel>
              <MetricValue>{formatBytes(summary.filesystem?.freeBytes)}</MetricValue>
              {summary.filesystem && (
                <Details>of {formatBytes(summary.filesystem.totalBytes)} total</Details>
              )}
            </Metric>
          </Summary>
        )}

        <StatusMessage role="status" aria-live="polite">
          {notice || (isFetching && !isLoading ? 'Updating storage…' : '')}
        </StatusMessage>

        {isLoading && <Message role="status">Loading storage…</Message>}
        {!isLoading && error && !data && (
          <>
            <Message role="alert">
              Could not load storage. Check your connection and try again.
            </Message>
            <Button appearance="settings" color="secondary" onClick={() => void refetch()}>
              Try again
            </Button>
          </>
        )}
        {!isLoading && error && data && (
          <>
            <Message role="alert">
              Could not refresh storage. Showing the last loaded results.
            </Message>
            <Button appearance="settings" color="secondary" onClick={() => void refetch()}>
              Try again
            </Button>
          </>
        )}
        {!isLoading && data?.items.length === 0 && (
          <Message>No downloaded content is using storage.</Message>
        )}
        {data && data.items.length > 0 && (
          <List aria-label="Downloaded content">
            {data.items.map(item => (
              <Item key={item.movieSourceId}>
                <div>
                  <ItemTitle>{item.title}</ItemTitle>
                  <Details>
                    {item.fileName ? `${item.fileName} · ` : ''}
                    {item.quality ? `${item.quality} · ` : ''}
                    {formatBytes(item.physicalBytes)} on disk · {formatBytes(item.reservedBytes)}{' '}
                    reserved
                  </Details>
                  <Details>
                    {statusLabel(item.activity)} ·{' '}
                    {item.videoComplete
                      ? 'Video complete'
                      : `${Math.round(item.progressPercent)}% downloaded`}
                    {item.activity === 'available_offline' && item.seedEndsAt
                      ? ` · Torrent ${item.torrentLoaded ? 'loaded' : 'may reload'} until ${new Date(item.seedEndsAt).toLocaleString()}`
                      : ''}
                    {item.activeStreams > 0 ? ' · Currently being watched' : ''}
                  </Details>
                </div>
                <Button
                  ref={node => {
                    if (node) buttonRefs.current.set(item.movieSourceId, node);
                    else buttonRefs.current.delete(item.movieSourceId);
                  }}
                  appearance="settings"
                  color="secondary"
                  disabled={item.activeStreams > 0 || removal.isLoading}
                  onClick={() => openConfirmation(item)}
                  aria-label={`Free space used by ${item.title}`}
                >
                  Free space
                </Button>
              </Item>
            ))}
          </List>
        )}

        <ActionRow>
          <Button ref={backRef} appearance="settings" color="secondary" onClick={onDismiss}>
            Back to Settings
          </Button>
        </ActionRow>
      </Content>

      {confirmedItem && (
        <DialogBackdrop>
          <Dialog
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="free-storage-title"
            aria-describedby="free-storage-description"
            onKeyDown={event => {
              if (event.key !== 'Tab') return;
              const buttons = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
              );
              if (buttons.length === 0) return;
              const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
              const next = event.shiftKey
                ? index <= 0
                  ? buttons.length - 1
                  : index - 1
                : index < 0 || index === buttons.length - 1
                  ? 0
                  : index + 1;
              event.preventDefault();
              buttons[next]?.focus({ preventScroll: true });
            }}
          >
            <DialogTitle id="free-storage-title">
              Free space used by {confirmedItem.title}?
            </DialogTitle>
            <Description id="free-storage-description">
              This deletes {formatBytes(confirmedItem.physicalBytes)} from this server. Future
              playback will require downloading it again.
            </Description>
            {dialogError && <Message role="alert">{dialogError}</Message>}
            <DialogActions>
              <Button
                ref={cancelRef}
                appearance="settings"
                color="secondary"
                disabled={removal.isLoading}
                onClick={() => {
                  setConfirmingId(null);
                  setDialogError('');
                }}
              >
                Cancel
              </Button>
              <Button
                appearance="settings"
                color="primary"
                disabled={removal.isLoading}
                onClick={() => void confirmRemoval(confirmedItem)}
              >
                {removal.isLoading ? 'Freeing space…' : 'Delete download'}
              </Button>
            </DialogActions>
          </Dialog>
        </DialogBackdrop>
      )}
    </Page>
  );
}
