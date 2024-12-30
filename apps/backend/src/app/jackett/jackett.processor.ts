import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import {
  jackettJobs,
  queues,
  SearchMovieData,
  SearchShowEpisodeData,
} from '@miauflix/types';
import { Job } from 'bullmq';
import { JackettService } from './jackett.service';
import { MoviesData } from '../movies/movies.data';
import { TorrentData } from '../torrent/torrent.data';
import { TorrentOrchestratorQueues } from '../torrent/torrent.orchestrator.queues';
import { ShowsData } from '../shows/shows.data';
import { Logger } from '@nestjs/common';

const MIN_TORRENTS = 10;

@Processor(queues.jackett)
export class JackettProcessor extends WorkerHost {
  private readonly logger = new Logger(JackettProcessor.name);
  constructor(
    private readonly jackettService: JackettService,
    private readonly torrentData: TorrentData,
    private readonly movieData: MoviesData,
    private readonly showData: ShowsData,
    private readonly torrentOrchestratorQueuesService: TorrentOrchestratorQueues
  ) {
    super();
  }

  @OnWorkerEvent('error')
  onError(job: Job) {
    console.error(`Error processing job ${job.id}`, job.returnvalue);
  }
  @OnWorkerEvent('failed')
  onFailed(job: Job) {
    console.error(`Failed processing job ${job.id}`, job.failedReason);
  }

  onApplicationBootstrap() {
    this.worker.concurrency = 5;
  }

  private async searchTorrentsForMovie({
    index,
    movieSlug,
    params,
  }: SearchMovieData) {
    console.log(`Searching torrents for movie ${params.q}`);
    const trackers = await this.jackettService.getTrackersByCategory('movie');
    const movie = await this.movieData.findMovie(movieSlug);
    let torrentsFound = 0;
    let processTrackers = 0;

    for (const tracker of trackers) {
      try {
        const torrents = await this.jackettService.queryTracker({
          trackerId: tracker.id,
          searchType: 'movie',
          queryParams: params,
        });

        if (torrents.length) {
          for (const torrent of torrents) {
            await this.torrentData.createTorrent({
              movieId: movie.id,
              runtime: movie.runtime,
              mediaSlug: movie.slug,
              title: torrent.title,
              pubDate: torrent.pubDate,
              size: torrent.size,
              url: torrent.urls[0].url,
              urlType: torrent.urls[0].type,
              tracker: tracker.id,
              seeders: torrent.seeders,
              codec: torrent.codec,
              source: torrent.source,
              peers: torrent.peers,
              quality: torrent.quality,
            });
          }

          console.log(
            `Added ${torrents.length} torrents for movie ${params.q}`
          );
          torrentsFound += torrents.length;
          processTrackers += 1;

          if (torrentsFound > MIN_TORRENTS) {
            await this.movieData.setTorrentSearched(movieSlug);
            break;
          }
        }
      } catch (error) {
        console.error('Failed to query tracker', tracker, error);
      }
    }
    console.log(
      `Processed movie ${params.q}, searched on ${processTrackers} ( of ${trackers.length}) trackers, found ${torrentsFound} torrents`
    );
    if (torrentsFound === 0) {
      await this.movieData.setNoSourceFound(movieSlug);
    } else {
      await this.torrentOrchestratorQueuesService.requestScanMovieTorrents(
        movie.id,
        index
      );
    }
  }

  private async searchTorrentsForShowEpisode({
    showSlug,
    showId,
    seasonId,
    episodeId,
    season,
    episode,
    params,
  }: SearchShowEpisodeData) {
    console.log(
      `Searching torrents for show ${params.q}, ${season}x${episode}`
    );
    const trackers = await this.jackettService.getTrackersByCategory('tv');
    const { firstAired, runtime } = await this.showData.findEpisode(episodeId);

    if (firstAired.getTime() > Date.now()) {
      console.log('Episode not aired yet, skipping search');
      return;
    }

    let torrentsFound = 0;
    let processTrackers = 0;

    for (const tracker of trackers) {
      console.log('Searching on ', tracker);
      try {
        const torrents = await this.jackettService.queryTracker({
          trackerId: tracker.id,
          searchType: 'tv',
          queryParams: params,
          airedOn: firstAired,
        });

        console.log(params, torrents);

        if (torrents.length) {
          for (const torrent of torrents) {
            if (torrent.episode === episode && torrent.season === season) {
              await this.torrentData.createTorrent({
                showId,
                seasonId,
                episodeId,
                seasonNum: season,
                episodeNum: episode,
                runtime,
                mediaSlug: showSlug,
                title: torrent.title,
                pubDate: torrent.pubDate,
                size: torrent.size,
                url: torrent.urls[0].url,
                urlType: torrent.urls[0].type,
                tracker: tracker.id,
                seeders: torrent.seeders,
                codec: torrent.codec,
                source: torrent.source,
                peers: torrent.peers,
                quality: torrent.quality,
              });
            } else {
              this.logger.error(
                'Season X Episode not matching',
                JSON.stringify(torrent),
                season,
                episode
              );
            }
          }

          console.log(`Added ${torrents.length} torrents for show ${params.q}`);
          torrentsFound += torrents.length;
          processTrackers += 1;

          if (torrentsFound > MIN_TORRENTS) {
            await this.showData.setEpisodeSearched(episodeId);
            break;
          }
        }
      } catch (error) {
        console.error('Failed to query tracker', tracker, error);
      }
    }

    console.log(
      `Processed show ${params.q}, searched on ${processTrackers} ( of ${trackers.length}) trackers, found ${torrentsFound} torrents`
    );
    if (torrentsFound === 0) {
      await this.showData.setNoSourceFound(episodeId);
    }

    await this.torrentOrchestratorQueuesService.requestScanEpisodeTorrents(
      episodeId,
      episode
    );
  }

  async process(
    job:
      | Job<SearchMovieData, void, jackettJobs.searchMovie>
      | Job<SearchShowEpisodeData, void, jackettJobs.searchShowEpisode>
  ) {
    switch (job.name) {
      case jackettJobs.searchMovie:
        return await this.searchTorrentsForMovie(job.data);
      case jackettJobs.searchShowEpisode:
        return await this.searchTorrentsForShowEpisode(job.data);
    }
  }
}
