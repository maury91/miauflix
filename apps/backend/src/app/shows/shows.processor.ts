import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { TraktApi } from '../trakt/trakt.api';
import { ShowsData } from './shows.data';
import {
  MediaImages,
  GetShowExtendedDataData,
  queues,
  SearchImagesForShowData,
  showJobs,
  GetShowEpisodesData,
} from '@miauflix/types';
import { TMDBApi } from '../tmdb/tmdb.api';
import { ShowsQueues } from './shows.queues';

@Processor(queues.show)
export class ShowsProcessor extends WorkerHost {
  constructor(
    private readonly traktService: TraktApi,
    private readonly tmdbApi: TMDBApi,
    private readonly showData: ShowsData,
    private readonly queues: ShowsQueues
  ) {
    super();
  }

  private async getShowExtendedData(showSlug: string, images?: MediaImages) {
    const showExists = await this.showData.findShow(showSlug);
    if (showExists) {
      if (images && images.poster && !showExists.poster) {
        await showExists.update(images);
      }
      return showExists;
    }
    const show = await this.traktService.getShow(showSlug, true);

    const createdShow = await this.showData.createShow({
      slug: show.ids.slug,
      title: show.title,
      year: show.year,
      genres: show.genres,
      runtime: show.runtime,
      overview: show.overview,
      rating: show.rating,
      trailer: show.trailer,
      traktId: show.ids.trakt,
      imdbId: show.ids.imdb,
      tmdbId: show.ids.tmdb,
      tvdbId: show.ids.tvdb,
      poster: images?.poster,
      backdrop: images?.backdrop,
      backdrops: images?.backdrops,
      logos: images?.logos,
      airedEpisodes: show.aired_episodes,
      network: show.network,
      status: show.status,
    });

    await this.queues.requestEpisodesForShow(showSlug);
    return createdShow;
  }

  private async getShowEpisodes(showSlug: string) {
    const show = await this.showData.findShow(showSlug);
    if (!show) {
      throw new Error('Show not found');
    }
    const seasons = await this.traktService.getShowSeasons(showSlug, true);
    for (const rawSeason of seasons) {
      const season = await this.showData.addSeason(show, {
        number: rawSeason.number,
        title: rawSeason.title,
        overview:
          typeof rawSeason.overview === 'string' ? rawSeason.overview : '',
        episodesCount: rawSeason.episode_count,
        airedEpisodes: rawSeason.aired_episodes,
        rating: rawSeason.rating,
        network: rawSeason.network,
        traktId: rawSeason.ids.trakt,
        tvdbId: rawSeason.ids.tvdb,
        tmdbId: rawSeason.ids.tmdb,
      });
      const episodes = await this.traktService.getShowSeasonEpisodes(
        showSlug,
        rawSeason.number,
        true
      );
      for (const episode of episodes) {
        await this.showData.addEpisode(season, {
          number: episode.number,
          title: episode.title,
          overview: episode.overview,
          rating: episode.rating,
          firstAired: new Date(episode.first_aired),
          traktId: episode.ids.trakt,
          imdbId: episode.ids.imdb,
          tmdbId: episode.ids.tmdb,
          tvdbId: episode.ids.tvdb,
          runtime: episode.runtime,
          order: episode.number_abs,
          episodeType: episode.episode_type,
        });
      }
    }
    await this.showData.updateLastCheckedAt(showSlug);
  }

  private async processGetShowExtendedData(
    job: Job<GetShowExtendedDataData, void, showJobs.getShowExtendedData>
  ) {
    // Double check if the show is in the database
    try {
      await this.getShowExtendedData(job.data.slug, job.data.images);
    } catch (error) {
      console.error('Failed to get show', job.data, error);
      throw error;
    }
  }

  private async processSearchImagesForShow(
    job: Job<SearchImagesForShowData, void, showJobs.searchImagesForShow>
  ) {
    try {
      const show = await this.showData.findShow(job.data.slug);
      if (!show) {
        console.error('Show not found', job.data);
        return;
      }
      const images = await this.tmdbApi.getSimpleMediaImages('tv', show.tmdbId);
      await show.update(images);
    } catch (error) {
      console.error('Failed to search images for show', job.data, error);
      throw error;
    }
  }

  private async processGetShowEpisodes(
    job: Job<GetShowEpisodesData, void, showJobs.getShowEpisodes>
  ) {
    try {
      await this.getShowEpisodes(job.data.slug);
    } catch (error) {
      console.error('Failed to get show episodes', job.data, error);
      throw error;
    }
  }

  async process(
    job:
      | Job<GetShowExtendedDataData, void, showJobs.getShowExtendedData>
      | Job<SearchImagesForShowData, void, showJobs.searchImagesForShow>
      | Job<GetShowEpisodesData, void, showJobs.getShowEpisodes>
  ) {
    switch (job.name) {
      case showJobs.getShowExtendedData:
        return this.processGetShowExtendedData(job);
      case showJobs.searchImagesForShow:
        return this.processSearchImagesForShow(job);
      case showJobs.getShowEpisodes:
        return this.processGetShowEpisodes(job);
      default:
        throw new Error(`No processor for job ${job}`);
    }
  }
}
