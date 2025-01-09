import { Global, Injectable, Module } from '@nestjs/common';
import {
  Show,
  ShowCreationAttributes,
} from '../../database/entities/show.entity';
import { ShowSimple as TraktShow } from '../trakt/trakt.types';
import { MediaImages, ShowDto } from '@miauflix/types';
import {
  Season,
  SeasonCreationAttributes,
} from '../../database/entities/season.entity';
import {
  Episode,
  EpisodeCreationAttributes,
} from '../../database/entities/episode.entity';
import { EpisodeSource } from '../../database/entities/episode.source.entity';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { In, Raw, Repository } from 'typeorm';
import { showToDto } from './shows.utils';

@Injectable()
export class ShowsData {
  constructor(
    @InjectRepository(Show) private readonly showModel: Repository<Show>,
    @InjectRepository(Season) private readonly seasonModel: Repository<Season>,
    @InjectRepository(Episode)
    private readonly episodeModel: Repository<Episode>
  ) {}

  async findShow(slug: string, withSeasons = false): Promise<Show | null> {
    if (withSeasons) {
      return await this.showModel.findOne({
        where: {
          slug,
        },
        relations: {
          seasons: {
            episodes: true,
          },
        },
      });
    }
    return await this.showModel.findOneBy({
      slug,
    });
  }

  async updateImages(showId: number, images: MediaImages): Promise<void> {
    await this.showModel.update({ id: showId }, images);
  }

  async updateSeasonsSount(
    showId: number,
    seasonsCount: number
  ): Promise<void> {
    await this.showModel.update({ id: showId }, { seasonsCount });
  }

  async updateEpisodeImage(episodeId: number, image: string): Promise<void> {
    await this.episodeModel.update(
      { id: episodeId },
      {
        image,
      }
    );
  }

  async findEpisode(id: number): Promise<Episode | null> {
    return await this.episodeModel.findOneBy({
      id,
    });
  }

  async findSeason(id: number): Promise<Season | null> {
    return await this.seasonModel.findOneBy({
      id,
    });
  }

  async findShowFromDb(id: number): Promise<Show | null> {
    return await this.showModel.findOneBy({
      id,
    });
  }

  async findShowsWithoutImages(): Promise<Show[]> {
    return await this.showModel.find({
      where: [
        {
          poster: '',
        },
        {
          backdrops: Raw((alias) => `cardinality(${alias}) = 0`),
        },
      ],
    });
  }

  async findTraktShow(slug: string): Promise<TraktShow | null> {
    const show = await this.showModel.findOne({
      select: [
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
    return await this.showModel.find({
      where: {
        slug: In(slugs),
      },
    });
  }

  async findShowsMap(slugs: string[]): Promise<Record<string, ShowDto>> {
    const storedShows = await this.findShows(slugs);
    return storedShows.reduce<Record<string, ShowDto>>(
      (acc, show) => ({
        ...acc,
        [show.slug]: showToDto(show),
      }),
      {}
    );
  }

  async createShow(show: ShowCreationAttributes): Promise<Show> {
    return await this.showModel.save(show);
  }

  async updateLastCheckedAt(slug: string): Promise<void> {
    await this.showModel.update(
      { slug },
      {
        lastCheckedAt: new Date(),
      }
    );
  }

  async addSeason(
    show: Show,
    season: Omit<SeasonCreationAttributes, 'showId'>
  ): Promise<Season> {
    const existingSeason = await this.seasonModel.findOne({
      where: {
        number: season.number,
        showId: show.id,
      },
    });

    if (existingSeason) {
      return await this.seasonModel.save({
        id: existingSeason.id,
        ...season,
        showId: show.id,
      });
    }

    return await this.seasonModel.save({ ...season, showId: show.id });
  }

  async addEpisode(
    season: Season,
    episode: Omit<EpisodeCreationAttributes, 'seasonId' | 'showId'>
  ): Promise<Episode> {
    // If an episode with the same number and season already exists, update it
    const existingEpisode = await this.episodeModel.findOne({
      where: {
        number: episode.number,
        seasonId: season.id,
      },
    });

    if (existingEpisode) {
      return await this.episodeModel.save({
        id: existingEpisode.id,
        ...episode,
        seasonId: season.id,
        showId: season.showId,
      });
    }

    return await this.episodeModel.save({
      ...episode,
      seasonId: season.id,
      showId: season.showId,
    });
  }

  async setEpisodeSearched(episodeId: number): Promise<void> {
    await this.episodeModel.update(episodeId, {
      sourcesSearched: true,
    });
  }

  async setNoSourceFound(episodeId: number): Promise<void> {
    await this.episodeModel.update(episodeId, {
      noSourceFound: true,
    });
  }

  async setSourceFound(episodeId: number): Promise<void> {
    await this.episodeModel.update(episodeId, {
      sourceFound: true,
    });
  }
}

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Show, Season, Episode, EpisodeSource])],
  providers: [ShowsData],
  exports: [ShowsData, TypeOrmModule],
})
export class ShowsDataModule {}
