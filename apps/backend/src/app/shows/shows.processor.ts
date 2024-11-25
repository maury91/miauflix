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
} from '@miauflix/types';
import { TMDBApi } from '../tmdb/tmdb.api';

@Processor(queues.show)
export class ShowsProcessor extends WorkerHost {
  constructor(
    private readonly traktService: TraktApi,
    private readonly tmdbApi: TMDBApi,
    private readonly showData: ShowsData
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

    return await this.showData.createShow({
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
  }

  async processGetShowExtendedData(
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

  async processSearchImagesForShow(
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

  async process(
    job:
      | Job<GetShowExtendedDataData, void, showJobs.getShowExtendedData>
      | Job<SearchImagesForShowData, void, showJobs.searchImagesForShow>
  ) {
    switch (job.name) {
      case showJobs.getShowExtendedData:
        return this.processGetShowExtendedData(job);
      case showJobs.searchImagesForShow:
        return this.processSearchImagesForShow(job);
      default:
        throw new Error(`No processor for job ${job}`);
    }
  }
}
