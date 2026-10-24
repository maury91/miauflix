import type { Database } from '@database/database';
import type { ContentSource } from '@entities/content-source.entity';
import type { EpisodeSource } from '@entities/episode-source.entity';
import type { ContentSourceRepository } from '@repositories/content-source.repository';
import type { EpisodeSourceRepository } from '@repositories/episode-source.repository';
import type { DownloadService } from '@services/download/download.service';
import { mainVideoPath } from '@services/download/download.utils';
import { ErrorWithStatus } from '@services/source/services/error-with-status.util';
import type { SourceHealthService } from '@services/source/source-health.service';

import type { PlaybackTarget } from './playback-target';

/** Resolves which file inside a content source a movie or episode plays. */
export class PlaybackTargetService {
  private readonly episodeSources: EpisodeSourceRepository;
  private readonly contentSources: ContentSourceRepository;

  constructor(
    db: Database,
    private readonly downloads: Pick<DownloadService, 'resolveLayout'>,
    private readonly sourceHealth?: Pick<SourceHealthService, 'markFailed'>
  ) {
    this.contentSources = db.getContentSourceRepository();
    this.episodeSources = db.getEpisodeSourceRepository();
  }

  /**
   * The movie's main video: the largest video file in the source. The choice is stored on the
   * movie link the first time it is made, so every later caller reads the same file. Resolving
   * a source without a known file list attaches its torrent to fetch the metadata.
   */
  async forMovie(movieId: number, source: ContentSource): Promise<PlaybackTarget> {
    const known = await this.contentSources.findMovieVideoFilePath(movieId, source.id);
    if (known) return { source, filePath: known, matchKind: 'movie' };
    const layout = await this.downloads.resolveLayout(source);
    const videoPath = mainVideoPath(layout.files);
    if (!videoPath) {
      // Typically a fake or archive-only torrent: never pick it for playback again soon.
      this.sourceHealth?.markFailed(source.id);
      throw new ErrorWithStatus('Source does not contain a video file', 'source_file_unavailable');
    }
    const filePath = await this.contentSources.setMovieVideoFilePath(movieId, source.id, videoPath);
    return { source, filePath, matchKind: 'movie' };
  }

  /** Resolve provider-relative episode paths against the actual torrent layout. */
  async forEpisode(
    match: Partial<Pick<EpisodeSource, 'id'>> &
      Pick<EpisodeSource, 'matchKind' | 'source' | 'videoFilePath'>
  ): Promise<PlaybackTarget | null> {
    if (!match.videoFilePath) return null;
    const layout = await this.downloads.resolveLayout(match.source);
    const exact = layout.files.find(file => file.path === match.videoFilePath);
    const candidates = exact
      ? [exact]
      : layout.files.filter(file => file.path.endsWith('/' + match.videoFilePath));
    if (candidates.length !== 1)
      throw new ErrorWithStatus(
        'Requested file is not part of this source',
        'source_file_unavailable'
      );
    let filePath = candidates[0].path;
    if (filePath !== match.videoFilePath && match.id !== undefined)
      filePath = await this.episodeSources.setVideoFilePath(
        match.id,
        match.videoFilePath,
        filePath
      );
    return { source: match.source, filePath, matchKind: match.matchKind };
  }
}
