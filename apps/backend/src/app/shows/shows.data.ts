import { Global, Injectable, Module } from '@nestjs/common';
import { InjectModel, SequelizeModule } from '@nestjs/sequelize';
import { Show, ShowCreationAttributes } from '../database/entities/show.entity';
import { ShowSimple as TraktShow } from '../trakt/trakt.types';
import { Op, Sequelize } from 'sequelize';
import { ShowDto } from '@miauflix/types';
import { Season } from '../database/entities/season.entity';
import { Episode } from '../database/entities/episode.entity';
import { Source } from '../database/entities/source.entity';

@Injectable()
export class ShowsData {
  constructor(@InjectModel(Show) private readonly showModel: typeof Show) {}

  async findShow(slug: string): Promise<Show | null> {
    return await this.showModel.findOne({
      where: {
        slug,
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
}

@Global()
@Module({
  imports: [SequelizeModule.forFeature([Show, Season, Episode, Source])],
  providers: [ShowsData],
  exports: [ShowsData, SequelizeModule],
})
export class ShowsDataModule {}
