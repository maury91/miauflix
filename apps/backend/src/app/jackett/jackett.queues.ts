import { Global, Injectable, Module } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import {
  jackettJobs,
  queues,
  SearchMovieData,
  SearchShowEpisodeData,
} from '@miauflix/types';
import { Job, Queue, QueueEvents } from 'bullmq';
import { Movie } from '../database/entities/movie.entity';
import { Show } from '../database/entities/show.entity';
import { Episode } from '../database/entities/episode.entity';
import { Season } from '../database/entities/season.entity';

@Injectable()
export class JackettQueues {
  private jackettEventsQueue: QueueEvents;
  constructor(
    @InjectQueue(queues.jackett)
    private readonly jackettQueue: Queue<
      SearchMovieData | SearchShowEpisodeData,
      void,
      jackettJobs.searchMovie | jackettJobs.searchShowEpisode
    >
  ) {
    // ToDo: Use configuration for redis connection
    this.jackettEventsQueue = new QueueEvents(queues.jackett);
  }

  public async prioritizeTorrentSearch(slug: string, priority: number) {
    const jobId = `search_torrents_${slug}`;
    const job = await this.jackettQueue.getJob(jobId);
    if (job) {
      job.changePriority({ priority });
      return job;
    }
    return false;
  }

  public async requestTorrentMovieSearch(
    movie: Movie,
    index: number,
    priority?: number
  ) {
    const jobId = `search_torrents_${movie.slug}`;
    return await this.jackettQueue.add(
      jackettJobs.searchMovie,
      {
        movieSlug: movie.slug,
        index: index,
        params: {
          // q: `${movie.title} (${movie.year})`,
          q: movie.slug,
          year: `${movie.year}`,
          traktid: `${movie.traktId}`,
          imdbid: movie.imdbId,
          tmdbid: `${movie.tmdbId}`,
        },
      },
      {
        jobId,
        priority: priority ?? (index < 10 ? 1000 : 2000),
      }
    );
  }

  public async requestTorrentEpisodeSearch(
    show: Show,
    season: Season,
    episode: Episode,
    priority?: number
  ) {
    const jobId = `search_torrents_${show.slug}_season_${season.number}_episode_${episode.number}`;
    return await this.jackettQueue.add(
      jackettJobs.searchShowEpisode,
      {
        showSlug: show.slug,
        showId: show.id,
        seasonId: season.id,
        episodeId: episode.id,
        season: season.number,
        episode: episode.number,
        params: {
          q: `${show.slug}`,
          year: `${show.year}`,
          season: `${season.number}`,
          ep: `${episode.number}`,
          traktid: `${show.traktId}`,
          imdbid: show.imdbId,
          tvdbid: `${show.tvdbId}`,
          tmdbid: `${show.tmdbId}`,
        },
      },
      {
        jobId,
        priority: priority ?? 1000,
      }
    );
  }

  public waitForJob(job: Job) {
    return job.waitUntilFinished(this.jackettEventsQueue);
  }
}

@Global()
@Module({
  imports: [
    BullModule.registerQueue({
      name: queues.jackett,
      defaultJobOptions: {
        removeOnComplete: true,
      },
    }),
  ],
  providers: [JackettQueues],
  exports: [JackettQueues],
})
export class JackettQueuesModule {}
