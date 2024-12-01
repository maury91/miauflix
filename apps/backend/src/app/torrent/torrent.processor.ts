import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { GetTorrentFileData, queues, torrentJobs } from '@miauflix/types';
import { Job } from 'bullmq';
import { TorrentService } from './torrent.service';
import { isValidVideoFile } from './torrent.utils';
import { TorrentData } from './torrent.data';
import { SourceData } from '../sources/sources.data';
import { MoviesData } from '../movies/movies.data';
import { ShowsData } from '../shows/shows.data';

@Processor(queues.torrent)
export class TorrentProcessor extends WorkerHost {
  private consecutiveErrors = 0;
  constructor(
    private readonly sourceData: SourceData,
    private readonly movieData: MoviesData,
    private readonly showData: ShowsData,
    private readonly torrentData: TorrentData,
    private readonly torrentService: TorrentService
  ) {
    super();
  }

  onApplicationBootstrap() {
    this.worker.concurrency = 16;
  }

  @OnWorkerEvent('error')
  onError(job: Job) {
    console.error(`Error processing job ${job.id}`, job.returnvalue);
  }
  @OnWorkerEvent('failed')
  onFailed(job: Job) {
    console.error(`Failed processing job ${job.id}`, job.failedReason);
  }

  private async getTorrentFileByUrl(url: string) {
    try {
      const torrentFile = await this.torrentService.downloadByUrl(url);
      this.consecutiveErrors = 0;
      return torrentFile;
    } catch (err) {
      console.error('Failed to download torrent', err, url);
      this.consecutiveErrors += 1;
      throw err;
    } finally {
      await this.worker.rateLimit(this.consecutiveErrors * 3000 + 1);
    }
  }

  private async getTorrentFile({
    mediaId,
    mediaType,
    hevc,
    highQuality,
  }: GetTorrentFileData) {
    console.log(
      `Searching for a torrent for ${mediaType}: ${mediaId}, [high quality: ${highQuality}, hevc: ${hevc}])`
    );
    const torrentCandidates = await this.torrentData.findTorrentToProcess({
      mediaId,
      mediaType,
      highQuality,
      hevc,
    });
    if (torrentCandidates.length) {
      const {
        id,
        url,
        quality,
        codec,
        mediaSlug,
        runtime,
        source,
        size,
        episodeNum,
        seasonNum,
      } = torrentCandidates[0];
      const torrent = await this.getTorrentFileByUrl(url);
      if (torrent.files.length) {
        try {
          const videoFiles = torrent.files.filter(
            isValidVideoFile(runtime, quality, codec)
          );

          if (videoFiles.length) {
            await torrentCandidates[0].update({
              // data: torrent.torrentFile,
              processed: true,
            });
            if (mediaType === 'movie') {
              const movie = await this.movieData.findMovieById(mediaId);
              await this.sourceData.createMovieSource({
                data: torrent.torrentFile,
                codec,
                quality,
                source,
                movieId: mediaId,
                movieSlug: movie.slug,
                videos: videoFiles.map((file) => file.name),
                size,
                originalSource: `torrent::${id}`,
              });
              await this.movieData.setSourceFound(mediaSlug);
            } else {
              await this.sourceData.createEpisodeSource({
                data: torrent.torrentFile,
                codec,
                quality,
                source,
                episodeId: mediaId,
                episodeNum,
                seasonNum,
                showSlug: mediaSlug,
                videos: videoFiles.map((file) => file.name),
                size,
                originalSource: `torrent::${id}`,
              });
              await this.showData.setSourceFound(mediaId);
            }
            console.log(`Torrent ${id} marked as valid`);
            return;
          }
        } catch (err) {
          console.error('Error processing torrent', err);
          throw err;
        }

        await torrentCandidates[0].update({
          processed: true,
          rejected: true,
        });
        console.error('No video files found in torrent', torrent.files);
        throw new Error('No video files found in torrent');
      } else {
        await torrentCandidates[0].update({
          processed: true,
          rejected: true,
        });
        throw new Error('Torrent contains no files');
      }
    }
  }

  async process(
    job: Job<GetTorrentFileData, void, torrentJobs.getTorrentFile>
  ) {
    switch (job.name) {
      case torrentJobs.getTorrentFile:
        return await this.getTorrentFile(job.data);
    }
  }
}
