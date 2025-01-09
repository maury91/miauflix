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
import { ShowEpisodeExtended, ShowSeasonExtended } from '../trakt/trakt.types';
import { ShowSeason } from '../tmdb/tmdb.types';
import { Season } from '../../database/entities/season.entity';
import { Show } from '../../database/entities/show.entity';

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
        await this.showData.updateImages(showExists.id, images);
      }
      return null;
    }
    const show = await this.traktService.getShow(showSlug, true);

    await this.showData.createShow({
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

    const job = await this.queues.requestEpisodesForShow(showSlug);
    return job.id;
  }

  private async addEpisodeToDatabase(
    season: Season,
    episode: ShowEpisodeExtended,
    seasonWithImages: ShowSeason
  ) {
    const episodeImage =
      seasonWithImages.episodes.find(
        ({ episode_number }) => episode_number === episode.number
      )?.still_path ?? '';
    return this.showData.addEpisode(season, {
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
      seasonNumber: season.number,
      image: episodeImage,
    });
  }

  private async getShowSeason(show: Show, rawSeason: ShowSeasonExtended) {
    const [season, tmdbSeason, episodes] = await Promise.all([
      this.showData.addSeason(show, {
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
      }),
      this.tmdbApi.getSeason(show.tmdbId, rawSeason.number),
      this.traktService.getShowSeasonEpisodes(
        show.slug,
        rawSeason.number,
        true
      ),
    ]);
    await Promise.all(
      episodes.map((episode) =>
        this.addEpisodeToDatabase(season, episode, tmdbSeason)
      )
    );
  }

  private async getShowEpisodes(showSlug: string) {
    const show = await this.showData.findShow(showSlug);
    if (!show) {
      throw new Error('Show not found');
    }
    const seasons = await this.traktService.getShowSeasons(showSlug, true);
    const latestSeason = seasons.reduce(
      (max, season) => (season.number > max ? season.number : max),
      0
    );
    await this.showData.updateSeasonsSount(show.id, latestSeason);
    await Promise.all(
      seasons.map((season) => this.getShowSeason(show, season))
    );
    await this.showData.updateLastCheckedAt(showSlug);
  }

  private async processGetShowExtendedData(
    job: Job<GetShowExtendedDataData, void, showJobs.getShowExtendedData>
  ) {
    // Double check if the show is in the database
    try {
      return await this.getShowExtendedData(job.data.slug, job.data.images);
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
      this.showData.updateImages(show.id, images);
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
