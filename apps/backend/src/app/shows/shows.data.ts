import { Global, Injectable, Module } from '@nestjs/common';
import { InjectModel, SequelizeModule } from '@nestjs/sequelize';
import { Show, ShowCreationAttributes } from '../database/entities/show.entity';
import { ShowSimple as TraktShow } from '../trakt/trakt.types';
import { Op, Sequelize } from 'sequelize';
import { ShowDto } from '@miauflix/types';
import {
  Season,
  SeasonCreationAttributes,
} from '../database/entities/season.entity';
import {
  Episode,
  EpisodeCreationAttributes,
} from '../database/entities/episode.entity';
import { EpisodeSource } from '../database/entities/episode.source.entity';

@Injectable()
export class ShowsData {
  constructor(
    @InjectModel(Show) private readonly showModel: typeof Show,
    @InjectModel(Season) private readonly seasonModel: typeof Season,
    @InjectModel(Episode) private readonly episodeModel: typeof Episode
  ) {}

  async findShow(slug: string, withSeasons = false): Promise<Show | null> {
    if (withSeasons) {
      return await this.showModel.findOne({
        where: {
          slug,
        },
        include: [
          {
            model: Season,
            include: [
              {
                model: Episode,
              },
            ],
          },
        ],
      });
    }
    return await this.showModel.findOne({
      where: {
        slug,
      },
    });
  }

  async findEpisode(id: number): Promise<Episode | null> {
    return await this.episodeModel.findOne({
      where: {
        id,
      },
      raw: true,
    });
  }

  async findSeason(id: number): Promise<Season | null> {
    return await this.seasonModel.findOne({
      where: {
        id,
      },
      raw: true,
    });
  }

  async findShowFromDb(id: number): Promise<Show | null> {
    return await this.showModel.findOne({
      where: {
        id,
      },
    });
  }

  async findShowsWithoutImages(): Promise<Show[]> {
    return await this.showModel.findAll({
      where: {
        [Op.or]: [
          {
            poster: '',
          },
          Sequelize.where(
            Sequelize.fn('cardinality', Sequelize.col('backdrops')),
            0
          ),
        ],
      },
    });
  }

  async findTraktShow(slug: string): Promise<TraktShow | null> {
    const show = await this.showModel.findOne({
      attributes: [
        'slug',
        'traktId',
        'tvdbId',
        'imdbId',
        'tmdbId',
        'title',
        'year',
      ],
      where: {
        slug,
      },
      raw: true,
    });

    if (!show) {
      return null;
    }

    return {
      ids: {
        tvdb: show.tvdbId,
        slug: show.slug,
        trakt: show.traktId,
        imdb: show.imdbId,
        tmdb: show.tmdbId,
      },
      title: show.title,
      year: show.year,
    };
  }

  async findShows(slugs: string[]): Promise<Show[]> {
    return await this.showModel.findAll({
      where: {
        slug: {
          [Op.in]: slugs,
        },
      },
      raw: true,
    });
  }

  async findShowsMap(slugs: string[]): Promise<Record<string, ShowDto>> {
    const storedShows = await this.findShows(slugs);
    return storedShows.reduce<Record<string, ShowDto>>(
      (acc, show) => ({
        ...acc,
        [show.slug]: {
          type: 'show',
          id: show.slug,
          title: show.title,
          year: show.year,
          ids: {
            trakt: show.traktId,
            slug: show.slug,
            imdb: show.imdbId,
            tmdb: show.tmdbId,
            tvdb: show.tvdbId,
          },
          images: {
            poster: show.poster,
            backdrop: show.backdrop,
            backdrops: show.backdrops,
            logos: show.logos,
          },
        },
      }),
      {}
    );
  }

  async createShow(show: ShowCreationAttributes): Promise<Show> {
    return (await this.showModel.upsert(show))[0];
  }

  async updateLastCheckedAt(slug: string): Promise<void> {
    await this.showModel.update(
      {
        lastCheckedAt: new Date(),
      },
      {
        where: {
          slug,
        },
      }
    );
  }

  async addSeason(
    show: Show,
    season: Omit<SeasonCreationAttributes, 'showId'>
  ): Promise<Season> {
    return (await this.seasonModel.upsert({ ...season, showId: show.id }))[0];
  }

  async addEpisode(
    season: Season,
    episode: Omit<EpisodeCreationAttributes, 'seasonId' | 'showId'>
  ): Promise<Episode> {
    return (
      await this.episodeModel.upsert({
        ...episode,
        seasonId: season.id,
        showId: season.showId,
      })
    )[0];
  }

  async setEpisodeSearched(episodeId: number): Promise<void> {
    await this.episodeModel.update(
      {
        sourcesSearched: true,
      },
      {
        where: {
          id: episodeId,
        },
      }
    );
  }

  async setNoSourceFound(episodeId: number): Promise<void> {
    await this.episodeModel.update(
      {
        noSourceFound: true,
      },
      {
        where: {
          id: episodeId,
        },
      }
    );
  }

  async setSourceFound(episodeId: number): Promise<void> {
    await this.episodeModel.update(
      {
        sourceFound: true,
      },
      {
        where: {
          id: episodeId,
        },
      }
    );
  }
}

@Global()
@Module({
  imports: [SequelizeModule.forFeature([Show, Season, Episode, EpisodeSource])],
  providers: [ShowsData],
  exports: [ShowsData, SequelizeModule],
})
export class ShowsDataModule {}
