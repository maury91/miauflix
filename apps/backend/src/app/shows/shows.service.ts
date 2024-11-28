import { Injectable } from '@nestjs/common';
import { TraktApi } from '../trakt/trakt.api';
import {
  ExtendedShowDto,
  Paginated,
  SeasonDto,
  ShowDto,
} from '@miauflix/types';
import { ShowSimple as TraktShow } from '../trakt/trakt.types';
import { NO_IMAGES, TMDBApi } from '../tmdb/tmdb.api';
import { ShowsData } from './shows.data';
import { ShowsQueues } from './shows.queues';
import { Show } from '../database/entities/show.entity';

@Injectable()
export class ShowsService {
  constructor(
    private readonly traktService: TraktApi,
    private readonly tmdbApi: TMDBApi,
    private readonly showData: ShowsData,
    private readonly showQueuesService: ShowsQueues
  ) {}

  private async getExtendedShow(
    slug: string,
    withSeasons = false
  ): Promise<Show> {
    const show = await this.showData.findShow(slug, withSeasons);

    if (!show) {
      console.log('Show not in DB');
      const traktShow = await this.traktService.getShow(slug);
      const images = await this.tmdbApi.getSimpleMediaImages(
        'tv',
        `${traktShow.ids.tmdb}`
      );
      const job = await this.showQueuesService.requestShowExtendedData(
        slug,
        0,
        images,
        0
      );
      await this.showQueuesService.waitForJob(job);
      return this.getExtendedShow(slug);
    }

    return show;
  }

  public async getShow(slug: string): Promise<ExtendedShowDto> {
    const show = await this.getExtendedShow(slug);

    return {
      type: 'show',
      id: show.slug,
      title: show.title,
      year: show.year,
      ids: {
        imdb: show.imdbId,
        tmdb: show.tmdbId,
        tvdb: show.tvdbId,
      },
      images: {
        backdrop: show.backdrop,
        backdrops: show.backdrops,
        logos: show.logos,
        poster: show.poster,
      },
      overview: show.overview,
      runtime: show.runtime,
      trailer: show.trailer,
      rating: Number(show.rating),
      genres: show.genres,
      airedEpisodes: show.airedEpisodes,
      network: show.network,
      seasons: show.seasonsCount,
    };
  }

  public async getShowSeasons(slug: string): Promise<SeasonDto[]> {
    const show = await this.getExtendedShow(slug, true);
    return show.seasons?.map((season) => ({
      number: season.number,
      title: season.title,
      overview: season.overview,
      episodesCount: season.episodesCount,
      airedEpisodes: season.airedEpisodes,
      rating: Number(season.rating),
      network: season.network,
      episodes: season.episodes.map((episode) => ({
        number: episode.number,
        order: episode.order,
        title: episode.title,
        overview: episode.overview,
        rating: Number(episode.rating),
        firstAired: episode.firstAired,
        runtime: episode.runtime,
        image: episode.image,
      })),
    }));
  }

  public async addExtendedDataToShows(shows: TraktShow[]): Promise<ShowDto[]> {
    const storedShows = await this.showData.findShowsMap(
      shows.map((show) => show.ids.slug)
    );

    const [showsWithImages, showsWithIncompleteInformation] =
      await this.tmdbApi.addImagesToMedias(
        'tv',
        shows.map((show) => {
          if (show.ids.slug in storedShows) {
            return storedShows[show.ids.slug];
          }
          return {
            ...show,
            type: 'show' as const,
            id: show.ids.slug,
            images: NO_IMAGES,
          };
        })
      );

    new Set([...showsWithIncompleteInformation]).forEach((showId) => {
      const index = showsWithImages.findIndex(
        (showWithImage) => showWithImage.id === showId
      );
      if (index !== -1) {
        this.showQueuesService.requestShowExtendedData(
          showId,
          index,
          showsWithImages[index].images
        );
      } else {
        console.error('Show not found in showsWithImages', showId);
      }
    });

    return showsWithImages;
  }

  public async getTrendingShows(page = 0): Promise<Paginated<ShowDto>> {
    const { data, ...pagination } = await this.traktService.getTrendingShows(
      page
    );
    this.traktService.preCacheNextPages(
      page,
      pagination.totalPages,
      'getTrendingShows'
    );
    const shows = data.map(({ show }) => show);

    return {
      data: await this.addExtendedDataToShows(shows),
      ...pagination,
    };
  }
}
