import type { Torrent } from 'webtorrent';

import { ErrorWithStatus } from '../../lib/errors';
import { logger } from '../../lib/logger';
import type { StorageService } from '../../storage/storage.service';
import type { EncryptedStorageLayout, PlaybackTarget, Storage } from '../../storage/types';
import {
  encodeRFC5987,
  getContentType,
  isPieceInBitfield,
  parseRangeHeader,
} from '../download.utils';
import { EncryptedFileReader } from '../encrypted-file-reader';
import type { EngineConfig } from '../engine-config';
import type { StartDownload } from './claim-requests';
import {
  DEFAULT_DURATION_SECONDS,
  MATROSKA_TAIL_BYTES,
  PLAYBACK_CLAIM,
  READAHEAD_MAX_BYTES,
  READAHEAD_MIN_BYTES,
  READAHEAD_PRIORITY,
  READAHEAD_SECONDS,
  READER_PRIORITY,
  READER_WINDOW_PIECES,
  RESUME_HEADER_BYTES,
  STREAM_SLICE_BYTES,
} from './constants';
import type { PlaybackBandwidth } from './playback-bandwidth';
import type { PlaybackState } from './playback-state';
import type { TorrentAttacher } from './torrent-attacher';
import type { StreamSelectingTorrent } from './types';

/**
 * Pieces a stream keeps selected from its read position: READAHEAD_SECONDS at the file's average
 * bitrate, clamped so a short or mislabelled file still reads ahead and a huge one cannot select
 * half the disk.
 */
export const readaheadPieceCount = (
  fileLength: number,
  durationSeconds: number,
  pieceLength: number
): number => {
  const bytes = Math.min(
    READAHEAD_MAX_BYTES,
    Math.max(READAHEAD_MIN_BYTES, (fileLength / durationSeconds) * READAHEAD_SECONDS)
  );
  return Math.max(READER_WINDOW_PIECES, Math.ceil(bytes / pieceLength));
};

type ByteRange = { start: number; end: number } | null | undefined;

/** Status and headers of a (possibly partial) response for a file. */
export const streamHeaders = (
  file: { name: string; length: number },
  range: ByteRange
): { status: number; headers: Record<string, string> } => {
  const headers: Record<string, string> = {
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
    'Content-Disposition': `inline; filename*=UTF-8''${encodeRFC5987(file.name)}`,
    'Content-Type': getContentType(file.name),
    Expires: '0',
    'transferMode.dlna.org': 'Streaming',
    'contentFeatures.dlna.org':
      'DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000',
    // CORS headers
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range',
  };
  if (range) {
    headers['Content-Range'] = `bytes ${range.start}-${range.end}/${file.length}`;
    headers['Content-Length'] = String(range.end - range.start + 1);
    return { status: 206, headers };
  }
  headers['Content-Length'] = String(file.length);
  return { status: 200, headers };
};

/**
 * The pieces a viewer's stream keeps selected ahead of its read position, as one WebTorrent
 * stream selection that moves with the reader. Zero pieces (inspection reads) selects nothing.
 */
export class ReadaheadWindow {
  private range: [number, number] | null = null;

  constructor(
    private readonly torrent: StreamSelectingTorrent | null,
    private readonly pieces: number,
    /** Last piece of the file; the window never selects past it. */
    private readonly lastPiece: number
  ) {}

  move(pieceIndex: number): void {
    if (!this.pieces || !this.torrent || this.torrent.destroyed) return;
    if (this.range?.[0] === pieceIndex) return;
    this.clear();
    this.range = [pieceIndex, Math.min(pieceIndex + this.pieces - 1, this.lastPiece)];
    this.torrent._select(this.range[0], this.range[1], READAHEAD_PRIORITY, undefined, true);
  }

  clear(): void {
    if (this.range && this.torrent && !this.torrent.destroyed)
      this.torrent._deselect(this.range[0], this.range[1], true);
    this.range = null;
  }
}

/** Wait until the response wants more bytes, the stream is cancelled, or the read aborts. */
const waitForDemand = async (
  controller: ReadableStreamDefaultController<Uint8Array>,
  signal: AbortSignal,
  isCancelled: () => boolean
): Promise<void> => {
  while (!isCancelled() && controller.desiredSize !== null && controller.desiredSize <= 0) {
    await new Promise<void>(resolveWait => {
      const finish = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', finish);
        resolveWait();
      };
      const timer = setTimeout(finish, 10);
      signal.addEventListener('abort', finish, { once: true });
    });
  }
};

/** The file a stream reads, with its display name. */
type StreamedFile = EncryptedStorageLayout['files'][number] & { name: string };

/** Everything one response body reads from. */
interface StreamContext {
  sourceId: number;
  file: StreamedFile;
  layout: EncryptedStorageLayout;
  storage: Storage;
  torrent: Torrent | null;
  reader: EncryptedFileReader;
  firstByte: number;
  lastByte: number;
  /** Inspection reads: no playback activity, health or readahead. */
  speculative: boolean;
  readahead: ReadaheadWindow;
  release: PlaybackRelease;
}

/**
 * Ends a stream's playback activity once, from whichever of body end or client cancel comes
 * first. Inspection reads hold no activity, so releasing them does nothing.
 */
interface PlaybackRelease {
  /** Whether the activity was released (never true for inspection reads). */
  readonly released: boolean;
  release(): Promise<void>;
}

/**
 * Serves byte ranges of a source's file as an HTTP response, decrypting stored pieces and
 * waiting on the torrent for missing ones. A viewer's stream counts as playback (claims,
 * bandwidth, health); a speculative inspection read does not.
 */
export class FileStreamer {
  constructor(
    private readonly storageService: StorageService,
    private readonly config: EngineConfig,
    private readonly torrents: TorrentAttacher,
    private readonly playback: PlaybackState,
    private readonly bandwidth: PlaybackBandwidth,
    private readonly startDownload: StartDownload
  ) {}

  /**
   * Stream a file from a torrent with range request support
   * Based on WebTorrent server implementation
   */
  streamFile(target: PlaybackTarget, rangeHeader?: string, speculative = false): Promise<Response> {
    return new Promise((resolve, reject) => {
      const handleRequest = async () => {
        resolve(await this.openStream(target, rangeHeader, speculative));
      };

      if (this.torrents.client.ready) {
        handleRequest().catch(reject);
      } else {
        this.torrents.client.once('ready', () => handleRequest().catch(reject));
      }
    });
  }

  private async openStream(
    target: PlaybackTarget,
    rangeHeader: string | undefined,
    speculative: boolean
  ): Promise<Response> {
    const sourceId = target.source.id;
    const { torrent, storage, layout } = await this.resolveDownload(target, speculative);
    const selected = layout.files.find(file => file.path === target.filePath);
    if (!selected) throw new Error('Requested torrent file is unavailable');
    const file = { ...selected, name: selected.path.split('/').pop() || selected.path };
    const range = parseRangeHeader(file.length, rangeHeader || '');
    const firstByte = range?.start ?? 0;
    const lastByte = range?.end ?? file.length - 1;
    // Refuse an inspection read before responding if its first piece cannot be fetched.
    // Later missing pieces can still cut the body short after the headers are sent.
    if (
      speculative &&
      !torrent &&
      !storage.localOnly &&
      !isPieceInBitfield(
        storage.downloadedPieces,
        Math.floor((file.offset + firstByte) / layout.pieceLength)
      )
    ) {
      throw new ErrorWithStatus(
        'Requested range is not stored and the source is not downloading',
        'local_media_incomplete'
      );
    }
    const reader = new EncryptedFileReader(
      storage.location,
      layout,
      selected.path,
      this.config.getOrThrow('SOURCE_SECURITY_KEY')
    );
    if (!speculative) await this.admitPlayback(sourceId, file.path);

    const { status, headers } = streamHeaders(file, range);
    const body = this.createBody({
      sourceId,
      file,
      layout,
      storage,
      torrent,
      reader,
      firstByte,
      lastByte,
      speculative,
      // Viewers keep the next READAHEAD_SECONDS selected; inspection reads only want headers.
      readahead: new ReadaheadWindow(
        torrent as StreamSelectingTorrent | null,
        speculative
          ? 0
          : readaheadPieceCount(file.length, this.durationOf(target), layout.pieceLength),
        Math.floor((file.offset + file.length - 1) / layout.pieceLength)
      ),
      release: this.playbackRelease(sourceId, file.path, speculative),
    });
    return new Response(body, { status, headers });
  }

  /**
   * A viewer's stream claims the file through a download; an inspection read only looks at a
   * source that is already warming, without promoting it to active playback.
   */
  private async resolveDownload(
    target: PlaybackTarget,
    speculative: boolean
  ): Promise<{ torrent: Torrent | null; storage: Storage; layout: EncryptedStorageLayout }> {
    if (!speculative) return this.startDownload(target, PLAYBACK_CLAIM);
    const existing = await this.storageService.getStorageBySource(target.source.id);
    if (!existing?.encryptedLayout)
      throw new Error('Speculative media source is no longer available');
    return {
      storage: existing,
      layout: existing.encryptedLayout,
      torrent: this.torrents.torrentAt(existing.location) ?? null,
    };
  }

  private durationOf(target: PlaybackTarget): number {
    return (
      target.durationSeconds ??
      (target.matchKind === 'movie'
        ? DEFAULT_DURATION_SECONDS.movie
        : DEFAULT_DURATION_SECONDS.episode)
    );
  }

  /**
   * Count a viewer's stream as playback. The first stream pauses speculative downloads; if that
   * fails the stream is uncounted again before the error propagates, since it has no release
   * callback yet and leftover counts would wedge future playback.
   */
  private async admitPlayback(sourceId: number, path: string): Promise<void> {
    await this.storageService.withSourceLock(sourceId, async () => {
      if (!(await this.storageService.setPlaybackActive(sourceId, true))) {
        throw new ErrorWithStatus('Storage record is unavailable', 'local_media_unavailable');
      }
      this.playback.openStream(sourceId, path);
      this.bandwidth.refreshTorrentPriorities();
      this.playback.notifyPlaybackChange();
      if (this.playback.streamCount === 1) {
        try {
          await this.bandwidth.pauseSpeculativeDownloads(sourceId);
        } catch (error) {
          this.playback.closeStream(sourceId, path);
          this.bandwidth.refreshTorrentPriorities();
          this.playback.notifyPlaybackChange();
          await this.storageService.setPlaybackActive(sourceId, false);
          throw error;
        }
      }
    });
  }

  private playbackRelease(sourceId: number, path: string, speculative: boolean): PlaybackRelease {
    let releasePromise: Promise<void> | undefined;
    return {
      get released() {
        return releasePromise !== undefined;
      },
      release: () => {
        if (speculative) return Promise.resolve();
        if (releasePromise) return releasePromise;
        this.playback.closeStream(sourceId, path);
        this.bandwidth.refreshTorrentPriorities();
        this.playback.notifyPlaybackChange();
        releasePromise = this.storageService.withSourceLock(sourceId, async () => {
          await this.storageService.setPlaybackActive(sourceId, false);
          if (this.playback.streamCount === 0) await this.bandwidth.resumeSpeculativeDownloads();
        });
        return releasePromise;
      },
    };
  }

  private createBody(stream: StreamContext): ReadableStream<Uint8Array> {
    let cancelled = false;
    const abortController = new AbortController();
    const isCancelled = () => cancelled;
    return new ReadableStream<Uint8Array>({
      start: async controller => {
        try {
          await this.pump(stream, controller, abortController.signal, isCancelled);
          if (!cancelled) controller.close();
        } catch (error) {
          if (!cancelled) controller.error(error);
        } finally {
          stream.readahead.clear();
          await stream.reader
            .close()
            .catch(error =>
              logger.warn('DownloadService', 'Failed to close encrypted file reader', error)
            );
          if (!stream.release.released) await stream.release.release();
        }
      },

      async cancel() {
        cancelled = true;
        abortController.abort();
        logger.debug('DownloadService', 'Stream cancelled by client');
        await stream.release.release();
      },
    });
  }

  /** Read the requested range piece by piece and hand it to the response as it wants bytes. */
  private async pump(
    stream: StreamContext,
    controller: ReadableStreamDefaultController<Uint8Array>,
    signal: AbortSignal,
    isCancelled: () => boolean
  ): Promise<void> {
    const { file, layout, sourceId, speculative } = stream;
    // Reads are slices of one piece; decrypt each piece once, not once per slice.
    let current = null as { index: number; piece: Buffer } | null;
    let cursor = stream.firstByte;
    while (!isCancelled() && cursor <= stream.lastByte) {
      // Header and index reads say nothing about where the viewer is.
      if (
        !speculative &&
        cursor >= RESUME_HEADER_BYTES &&
        cursor < file.length - MATROSKA_TAIL_BYTES
      ) {
        this.playback.setReadFraction(sourceId, file.path, cursor / file.length);
      }
      const torrentOffset = file.offset + cursor;
      const pieceIndex = Math.floor(torrentOffset / layout.pieceLength);
      const pieceOffset = torrentOffset % layout.pieceLength;
      if (current?.index !== pieceIndex) {
        current = null;
        stream.readahead.move(pieceIndex);
        current = {
          index: pieceIndex,
          piece: await this.readVerifiedPiece(
            stream.reader,
            stream.torrent,
            stream.storage,
            pieceIndex,
            signal,
            // Inspection reads are not playback; only viewers count toward source health.
            !speculative
          ),
        };
      }
      const { piece } = current;
      const bytes = piece.subarray(
        pieceOffset,
        Math.min(
          piece.length,
          layout.pieceLength,
          pieceOffset + STREAM_SLICE_BYTES,
          pieceOffset + stream.lastByte - cursor + 1
        )
      );
      if (!bytes.length)
        throw new ErrorWithStatus(
          'Encrypted media ended before the requested range',
          'local_media_incomplete'
        );
      await waitForDemand(controller, signal, isCancelled);
      if (isCancelled()) break;
      controller.enqueue(bytes);
      if (!speculative) this.playback.markDelivered(sourceId);
      cursor += bytes.length;
    }
  }

  /**
   * Read a piece once it is verified, fetching it first if needed: the reader's window is
   * selected above every claim and marked critical until the piece arrives, the torrent
   * closes, or the read is aborted.
   */
  private async readVerifiedPiece(
    reader: EncryptedFileReader,
    torrent: Torrent | null,
    storage: Storage,
    pieceIndex: number,
    signal: AbortSignal,
    playback = false
  ): Promise<Buffer> {
    const waitStart = Date.now();
    while (!signal.aborted) {
      if (
        storage.localOnly ||
        torrent?.bitfield?.get(pieceIndex) ||
        isPieceInBitfield(storage.downloadedPieces, pieceIndex)
      ) {
        return reader.readPiece(pieceIndex);
      }
      if (!torrent || torrent.destroyed) {
        throw new ErrorWithStatus(
          'Media piece is unavailable after torrent removal',
          'local_media_incomplete'
        );
      }
      // Fetch what this reader needs now, even outside claimed ranges (an index at the end of
      // the file): a stream selection survives selection rebuilds, and critical pieces let
      // faster peers take over slow requests.
      const lastPiece = Math.min(pieceIndex + READER_WINDOW_PIECES - 1, torrent.pieces.length - 1);
      const streamTorrent = torrent as StreamSelectingTorrent;
      streamTorrent._select(pieceIndex, lastPiece, READER_PRIORITY, undefined, true);
      torrent.critical(pieceIndex, lastPiece);
      // A viewer waiting on bytes is what source health judges (see getPlaybackHealth).
      const blocked = Symbol('blocked read');
      if (playback) this.playback.blockedReads(storage.sourceId).set(blocked, waitStart);
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          if (playback) this.playback.blockedReads(storage.sourceId).delete(blocked);
          torrent.removeListener('verified', onVerified);
          torrent.removeListener('close', onClose);
          signal.removeEventListener('abort', onAbort);
          if (!torrent.destroyed) streamTorrent._deselect(pieceIndex, lastPiece, true);
        };
        const onVerified = () => {
          if (torrent.bitfield?.get(pieceIndex)) {
            cleanup();
            resolve();
          }
        };
        const onClose = () => {
          cleanup();
          reject(
            new ErrorWithStatus('Torrent closed before media was downloaded', 'torrent_closed')
          );
        };
        const onAbort = () => {
          cleanup();
          resolve();
        };
        torrent.on('verified', onVerified);
        torrent.once('close', onClose);
        signal.addEventListener('abort', onAbort, { once: true });
      });
    }
    throw new Error('Playback cancelled');
  }
}
