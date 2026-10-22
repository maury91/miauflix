import type { Database } from '@database/database';
import type { ContentSource } from '@entities/content-source.entity';
import type { EpisodeSource } from '@entities/episode-source.entity';
import type { ContentSourceRepository } from '@repositories/content-source.repository';
import type { DownloadService } from '@services/download/download.service';
import { mainVideoPath } from '@services/download/download.utils';
import { ErrorWithStatus } from '@services/source/services/error-with-status.util';

import type { PlaybackTarget } from './playback-target';

/** Resolves which file inside a content source a movie or episode plays. */
export class PlaybackTargetService {
  private readonly contentSources: ContentSourceRepository;

  constructor(
    db: Database,
    private readonly downloads: Pick<DownloadService, 'resolveLayout'>
  ) {
    this.contentSources = db.getContentSourceRepository();
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
    if (!videoPath)
      throw new ErrorWithStatus('Source does not contain a video file', 'source_file_unavailable');
    const filePath = await this.contentSources.setMovieVideoFilePath(movieId, source.id, videoPath);
    return { source, filePath, matchKind: 'movie' };
  }

  /** The episode's matched file; null when the provider never listed it. */
  forEpisode(match: Pick<EpisodeSource, 'matchKind' | 'source' | 'videoFilePath'>) {
    return match.videoFilePath
      ? ({
          source: match.source,
          filePath: match.videoFilePath,
          matchKind: match.matchKind,
        } satisfies PlaybackTarget)
      : null;
  }
}
