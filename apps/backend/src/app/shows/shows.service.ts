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
import { Show } from '../../database/entities/show.entity';
import { Season } from '../../database/entities/season.entity';
import { JackettQueues } from '../jackett/jackett.queues';
import { TorrentOrchestratorQueues } from '../torrent/torrent.orchestrator.queues';
import { showToDto } from './shows.utils';

@Injectable()
export class ShowsService {
  constructor(
    private readonly traktService: TraktApi,
    private readonly tmdbApi: TMDBApi,
    private readonly showData: ShowsData,
    private readonly showQueuesService: ShowsQueues,
    private readonly jackettQueuesService: JackettQueues,
    private readonly torrentOrchestratorQueuesService: TorrentOrchestratorQueues
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
      const getSeasonsJob: string | null =
        await this.showQueuesService.waitForJob(job);
      if (withSeasons && getSeasonsJob) {
        await this.showQueuesService.waitForJob(getSeasonsJob);
      }

      return this.getExtendedShow(slug, withSeasons);
    }

    return show;
  }

  public async getShow(slug: string): Promise<ExtendedShowDto> {
    const show = await this.getExtendedShow(slug, true);

    return {
      ...showToDto(show),
      overview: show.overview,
      runtime: show.runtime,
      trailer: show.trailer,
      rating: Number(show.rating),
      genres: show.genres,
      airedEpisodes: show.airedEpisodes,
      network: show.network,
      seasonsCount: show.seasonsCount,
      seasons: show.seasons
        .sort((a, b) => a.number - b.number)
        .map((season) => ({ number: season.number, title: season.title })),
    };
  }

  private static mapSeasonToSeasonDto(season: Season): SeasonDto {
    return {
      number: season.number,
      title: season.title,
      overview: season.overview,
      episodesCount: season.episodesCount,
      airedEpisodes: season.airedEpisodes,
      rating: season.rating,
      network: season.network,
      episodes: season.episodes
        .map((episode) => ({
          id: episode.id,
          traktId: episode.traktId,
          number: episode.number,
          order: episode.order,
          title: episode.title,
          overview: episode.overview,
          rating: episode.rating,
          firstAired: episode.firstAired,
          runtime: episode.runtime,
          image: episode.image,
          sourceFound: episode.sourceFound,
          noSourceFound: episode.noSourceFound,
        }))
        .sort((a, b) => a.number - b.number),
    };
  }

  public async getShowSeasons(slug: string): Promise<SeasonDto[]> {
    const show = await this.getExtendedShow(slug, true);
    return show.seasons?.map(ShowsService.mapSeasonToSeasonDto) ?? [];
  }

  public async getShowSeason(
    slug: string,
    seasonNumber: number
  ): Promise<SeasonDto> {
    const show = await this.getExtendedShow(slug, true);
    const season = show.seasons.find(
      (season) => season.number === seasonNumber
    );
    if (!season) {
      // ToDo: obtain the season if missing
      throw new Error('Season not found');
    }
    // Request torrent search
    Promise.all(
      season.episodes.map((episode) => {
        if (!episode.sourcesSearched) {
          console.log('Search source for episode', episode.number);
          return this.jackettQueuesService.requestTorrentEpisodeSearch(
            show,
            season,
            episode
          );
        } else if (!episode.sourceFound) {
          console.log('Scan episode', episode.number);
          return this.torrentOrchestratorQueuesService.requestScanEpisodeTorrents(
            episode.id,
            episode.number
          );
        }
        return null;
      })
    );
    const missingImages = season.episodes.some((episode) => !episode.image);
    if (missingImages) {
      console.log('Searching missing images');
      const tmdbSeason = await this.tmdbApi.getSeason(
        show.tmdbId,
        season.number
      );
      for (const episode of season.episodes) {
        if (!episode.image) {
          const episodeImage = tmdbSeason.episodes.find(
            ({ episode_number }) => episode_number === episode.number
          )?.still_path;
          if (episodeImage) {
            this.showData.updateEpisodeImage(episode.id, episodeImage);
            episode.image = episodeImage;
          }
        }
      }
    }

    return ShowsService.mapSeasonToSeasonDto(season);
  }

  public async addExtendedDataToShows(shows: TraktShow[]): Promise<ShowDto[]> {
    const storedShows = await this.showData.findShowsMap(
      shows.map((show) => show.ids.slug)
    );

    const [showsWithImages, showsWithIncompleteInformation] =
      await this.tmdbApi.addImagesToMedias(
        'tv',
        shows.map((show): ShowDto => {
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
