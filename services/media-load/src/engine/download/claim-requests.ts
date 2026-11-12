import type { ClaimRequest, WarmupResult } from '@miauflix/service-contracts';

import type { StorageService } from '../../storage/storage.service';
import { type PlaybackTarget, withFile } from '../../storage/types';
import { claimInput, type ClaimSelection } from './claim-selection';
import {
  MATROSKA_TAIL_BYTES,
  MAX_SIDECAR_BYTES,
  PLAYBACK_CLAIM,
  RESUME_HEADER_BYTES,
  RESUME_LEAD_BYTES,
  SIDECAR_SUBTITLE,
} from './constants';
import type { DownloadLifecycle, StartDownloadOptions } from './download-lifecycle';
import { getRangeByteLength, getTorrentPieceCount, isFileStored, prefixPieces } from './layout';
import type { PlaybackBandwidth } from './playback-bandwidth';
import type { GreedyDownload } from './types';

export type StartDownload = (
  target: PlaybackTarget,
  claim: ClaimRequest,
  options?: StartDownloadOptions
) => Promise<GreedyDownload>;

/** Start of a resume warmup window: early enough to absorb bitrate variation, within the file. */
export const resumeRangeStart = (
  fileLength: number,
  bytes: number,
  startFraction: number
): number => {
  if (!(startFraction > 0) || !Number.isFinite(startFraction)) return 0;
  const estimate = Math.floor(Math.min(1, startFraction) * fileLength);
  const start = Math.min(estimate - RESUME_LEAD_BYTES, fileLength - bytes);
  // Too close to the start to be worth a separate window: warm the prefix instead.
  return start > RESUME_HEADER_BYTES ? start : 0;
};

/**
 * What claim owners ask of a source: warm part of a file, keep it for a viewer, download it in
 * the background, fetch its subtitle sidecars, or stop warming it. Each one claims through
 * `startDownload`.
 */
export class ClaimRequests {
  constructor(
    private readonly storageService: StorageService,
    private readonly startDownload: StartDownload,
    private readonly lifecycle: DownloadLifecycle,
    private readonly selection: ClaimSelection,
    private readonly bandwidth: PlaybackBandwidth
  ) {}

  /**
   * Claim the smallest piece-aligned range of the target file that covers the byte target,
   * capped at the file end, for one warmup lease. The range starts at the file start, or near
   * `startFraction` of the file for a resume (the header is then kept too). A whole-file claim
   * by anyone else on the same file keeps the full file selected.
   *
   * @returns Inclusive piece indices and their actual byte length, which can exceed the target.
   * @throws Propagates download failures, including a target file missing from the source.
   */
  async warmSource(
    target: PlaybackTarget,
    targetBytes: number,
    leaseKey: string,
    startFraction = 0
  ): Promise<WarmupResult> {
    const { source, filePath } = target;
    const requested = Math.max(1, Math.min(Math.floor(targetBytes), source.size || targetBytes));
    const resuming = startFraction > 0 && Number.isFinite(startFraction);
    // A resume claims only the header until the file length places the window.
    const claim: ClaimRequest = {
      kind: 'warmup',
      ownerKey: leaseKey,
      rangeEnd: resuming ? Math.min(requested, RESUME_HEADER_BYTES) : requested,
    };
    const download = await this.startDownload(target, claim, {
      reservedBytes: Math.min(
        source.size || Infinity,
        requested +
          (resuming ? RESUME_HEADER_BYTES : 0) +
          (/\.(mkv|webm)$/i.test(filePath) ? MATROSKA_TAIL_BYTES : 0)
      ),
    });
    const file = download.layout.files.find(candidate => candidate.path === filePath)!;
    const rangeStart = resumeRangeStart(file.length, requested, startFraction);
    if (resuming) {
      // Completion was settled by the first claim, so this one must not reopen the source.
      await this.storageService.claimFile(
        source.id,
        filePath,
        claimInput({ ...claim, rangeStart, rangeEnd: rangeStart + requested }),
        true
      );
      await this.selection.reconcileSelection(source.id);
    }
    const pieceLength = download.layout.pieceLength;
    const pieceCount = download.torrent
      ? getTorrentPieceCount(download.torrent)
      : Math.ceil(
          download.layout.files.reduce((total, item) => total + item.length, 0) / pieceLength
        );
    const { firstPiece, lastPiece } = prefixPieces(
      file.offset + rangeStart,
      Math.min(requested, file.length - rangeStart),
      pieceLength,
      pieceCount
    );
    return {
      sourceId: source.id,
      filePath,
      targetBytes: download.torrent
        ? getRangeByteLength(download.torrent, firstPiece, lastPiece)
        : requested,
      firstPiece,
      lastPiece,
    };
  }

  /** Stop warming a source: its warmup claims are released; other owners' claims continue. */
  async pauseSource(sourceId: number): Promise<boolean> {
    const storage = await this.storageService.getStorageBySource(sourceId);
    if (!storage) return false;
    await this.storageService.releaseClaims(sourceId, { kind: 'warmup' });
    await this.selection.reconcileSelection(sourceId);
    await this.lifecycle.detachUnclaimedTorrent(sourceId);
    return true;
  }

  /** Keep the target file for a viewer; no source ranking or replacement occurs. */
  async promoteSource(target: PlaybackTarget, ownerKey: string): Promise<boolean> {
    await this.startDownload(target, { kind: 'watched', ownerKey });
    await this.storageService.markAsAccessed(target.source.id);
    return true;
  }

  /**
   * Download one file in the background for a claim owner while preserving the playback reserve.
   * Within a shared source the playing file keeps higher piece priority; another source waits
   * only until active playback has fully buffered its file.
   */
  async predownload(target: PlaybackTarget, claim: ClaimRequest): Promise<boolean> {
    const { source } = target;
    const download = await this.startDownload(target, claim);
    if (!download.torrent) return true;
    await this.storageService.withSourceLock(source.id, () =>
      this.bandwidth.yieldToBufferingPlayback(source.id)
    );
    return true;
  }

  /**
   * Request small subtitle sidecars of the target video. Sidecars take the video's live claims,
   * so they are kept, downloaded, and evicted together with it.
   */
  async prepareSubtitleFiles(target: PlaybackTarget, paths: string[]): Promise<void> {
    if (!paths.length) return;
    const existing = await this.storageService.getStorageBySource(target.source.id);
    const layout = existing?.encryptedLayout;
    if (!existing || !layout) return;
    const sidecars = paths.filter(path => {
      const file = layout.files.find(candidate => candidate.path === path);
      return file && file.length <= MAX_SIDECAR_BYTES && SIDECAR_SUBTITLE.test(path);
    });
    if (!sidecars.length) return;
    await this.storageService.copyClaims(target.source.id, target.filePath, sidecars);
    const files = await this.storageService.getFiles(target.source.id);
    for (const path of sidecars) {
      if (isFileStored(existing, layout, path, files)) continue;
      await this.startDownload(withFile(target, path), PLAYBACK_CLAIM);
    }
  }
}
