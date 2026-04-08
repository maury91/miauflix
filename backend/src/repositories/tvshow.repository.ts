import type { DataSource, Repository } from 'typeorm';
import { In } from 'typeorm';

import { Episode } from '@entities/episode.entity';
import type { Genre } from '@entities/genre.entity';
import { Season } from '@entities/season.entity';
import { TVShow } from '@entities/tvshow.entity';
import { TVShowTranslation } from '@entities/tvshow.entity';
import { objectKeys } from '@utils/object.util';

export class TVShowRepository {
  private readonly tvShowRepository: Repository<TVShow>;
  private readonly seasonRepository: Repository<Season>;
  private readonly episodeRepository: Repository<Episode>;
  private readonly tvShowTranslationRepository: Repository<TVShowTranslation>;

  constructor(datasource: DataSource) {
    this.tvShowRepository = datasource.getRepository(TVShow);
    this.tvShowTranslationRepository = datasource.getRepository(TVShowTranslation);
    this.seasonRepository = datasource.getRepository(Season);
    this.episodeRepository = datasource.getRepository(Episode);
  }

  async findByIds(ids: number[]): Promise<TVShow[]> {
    return this.tvShowRepository.findBy({ id: In(ids) });
  }

  async findByTMDBId(tmdbId: number): Promise<TVShow | null> {
    return this.tvShowRepository.findOne({
      where: { tmdbId },
      relations: {
        genres: true,
        translations: true,
        seasons: true,
      },
    });
  }

  async findIncompleteSeasons(): Promise<Season[]> {
    return this.seasonRepository.find({
      where: { synced: false },
      relations: {
        tvShow: true,
      },
    });
  }

  async findIncompleteSeasonsByShowIds(showIds: number[]): Promise<Season[]> {
    if (showIds.length === 0) {
      return [];
    }

    return this.seasonRepository.find({
      where: {
        synced: false,
        tvShow: { id: In(showIds) },
      },
      relations: {
        tvShow: true,
      },
    });
  }

  async findIncompleteSeason(): Promise<Season | null> {
    return this.seasonRepository.findOne({
      where: { synced: false },
      relations: {
        tvShow: true,
      },
    });
  }

  async markSeasonAsSynced(season: Season): Promise<void> {
    await this.seasonRepository.update(
      {
        id: season.id,
      },
      {
        synced: true,
      }
    );
  }

  async create(
    tvShow: Partial<TVShow>,
    {
      translations = [],
      seasons = [],
    }: {
      translations?: Pick<TVShowTranslation, 'language' | 'name' | 'overview' | 'tagline'>[];
      seasons?: Pick<
        Season,
        'airDate' | 'name' | 'overview' | 'posterPath' | 'seasonNumber' | 'tmdbId'
      >[];
    } = {}
  ): Promise<TVShow> {
    const newTVShow = this.tvShowRepository.create(tvShow);
    const savedShow = await this.tvShowRepository.save(newTVShow);

    if (translations.length) {
      savedShow.translations = await Promise.all(
        translations.map(translation => this.addTranslation(savedShow, translation))
      );
    }

    if (seasons.length) {
      savedShow.seasons = await Promise.all(
        seasons.map(season => this.createSeason(savedShow, season))
      );
    }
    return savedShow;
  }

  async addTranslation(
    tvShow: TVShow,
    translation: Partial<TVShowTranslation>
  ): Promise<TVShowTranslation> {
    const newTranslation = this.tvShowTranslationRepository.create({
      ...translation,
      tvShow,
    });
    await this.tvShowTranslationRepository.upsert(newTranslation, ['tvShowId', 'language']);

    return newTranslation;
  }

  async checkForChangesAndUpdate(tvShow: TVShow, updatedTVShow: Partial<TVShow>): Promise<void> {
    const hasChanges = objectKeys(updatedTVShow).some(key => {
      return tvShow[key] !== updatedTVShow[key];
    });
    if (hasChanges) {
      await this.tvShowRepository.update(tvShow.id, updatedTVShow);
    }
  }

  async saveTVShow(tvShow: TVShow): Promise<TVShow> {
    return this.tvShowRepository.save(tvShow);
  }

  /**
   * Creates a season for a TV show.
   * @param tvShow - The TV show to create the season for
   * @param seasonData - The season data to create the season with
   * @returns The created season
   */
  async createSeason(
    tvShow: TVShow,
    seasonData: Partial<Season>,
    { episodes = [] }: { episodes?: Partial<Episode>[] } = {}
  ): Promise<Season> {
    const existingSeason = await this.seasonRepository.findOne({
      where: {
        tvShowId: tvShow.id,
        seasonNumber: seasonData.seasonNumber,
      },
    });

    if (existingSeason) {
      return existingSeason;
    }

    const newSeason = this.seasonRepository.create({
      ...seasonData,
      tvShowId: tvShow.id,
      synced: false,
    });

    const savedSeason = await this.seasonRepository.save(newSeason);

    if (episodes.length) {
      savedSeason.episodes = await Promise.all(
        episodes.map(episode => this.createEpisode(savedSeason, episode))
      );
    }

    return savedSeason;
  }

  async createEpisode(season: Season, episodeData: Partial<Episode>): Promise<Episode> {
    const existingEpisode = await this.episodeRepository.findOne({
      where: {
        seasonId: season.id,
        episodeNumber: episodeData.episodeNumber,
      },
    });

    if (existingEpisode) {
      return existingEpisode;
    }

    const newEpisode = this.episodeRepository.create({
      ...episodeData,
      seasonId: season.id,
    });

    return await this.episodeRepository.save(newEpisode);
  }

  async checkForChangesAndUpdateGenres(show: TVShow, genres: Genre[]): Promise<void> {
    const showGenreIds = show.genres?.map(genre => genre.id).sort() ?? [];
    if (
      showGenreIds.toString() !==
      genres
        .map(g => g.id)
        .sort()
        .toString()
    ) {
      await this.updateGenres(show, genres);
    }
  }

  async updateGenres(show: TVShow, genres: Genre[]): Promise<void> {
    const updatedShow = await this.tvShowRepository.findOneBy({
      id: show.id,
    });
    if (!updatedShow) {
      throw new Error('TV Show not found');
    }
    updatedShow.genres = genres;
    await this.tvShowRepository.save(updatedShow);
  }

  async updateSeasonSyncStatus(season: Season, synced: boolean): Promise<void> {
    await this.seasonRepository.update(
      {
        id: season.id,
      },
      {
        synced,
      }
    );
  }

  async updateSeasonDetails(season: Season, seasonData: Partial<Season>): Promise<void> {
    await this.seasonRepository.update({ id: season.id }, seasonData);
  }

  /**
   * Get TV show IDs where the user has marked shows as watching
   */
  async getWatchingTVShowIds(): Promise<number[]> {
    const watchingShows = await this.tvShowRepository.find({
      where: { watching: true },
      select: ['id'],
    });

    return watchingShows.map(show => show.id);
  }

  /**
   * Mark a TV show as watching
   */
  async markAsWatching(tvShowId: number): Promise<void> {
    await this.tvShowRepository.update({ id: tvShowId }, { watching: true });
  }

  /**
   * Mark a TV show as not watching
   */
  async markAsNotWatching(tvShowId: number): Promise<void> {
    await this.tvShowRepository.update({ id: tvShowId }, { watching: false });
  }
}
