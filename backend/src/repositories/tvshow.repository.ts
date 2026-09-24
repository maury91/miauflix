import type { EntityManager, Repository } from 'typeorm';
import { In } from 'typeorm';

import type { Database } from '@database/database';
import { Episode } from '@entities/episode.entity';
import { Season } from '@entities/season.entity';
import { TVShow } from '@entities/tvshow.entity';
import { RepositoryError } from '@errors/repository.errors';
import type { SeasonDetail, TVShowDetail } from '@services/catalog/catalog.types';

/**
 * Local index of catalog tv shows, seasons and episodes — see movie.repository.ts.
 * Full catalog data lives in the media-catalog service; this maintains only the
 * mirror needed for local SQL (watching flags, playback joins, source search).
 */
export class TVShowRepository {
  private readonly tvShowRepository: Repository<TVShow>;
  private readonly seasonRepository: Repository<Season>;
  private readonly episodeRepository: Repository<Episode>;

  constructor(private readonly database: Database) {
    this.tvShowRepository = database.getRepository(TVShow);
    this.seasonRepository = database.getRepository(Season);
    this.episodeRepository = database.getRepository(Episode);
  }

  async findByIds(ids: number[]): Promise<TVShow[]> {
    return this.tvShowRepository.findBy({ id: In(ids) });
  }

  async findByMediaId(mediaId: number): Promise<TVShow | null> {
    return this.tvShowRepository.findOne({
      where: { mediaId },
      relations: {
        seasons: true,
      },
    });
  }

  async findListItemsByMediaIds(mediaIds: number[]): Promise<TVShow[]> {
    if (mediaIds.length === 0) return [];
    return this.tvShowRepository.find({
      where: { mediaId: In(mediaIds) },
    });
  }

  /** Lightweight lookup used by list refreshes; deliberately bypasses relations. */
  async findReferencesByMediaIds(
    mediaIds: number[]
  ): Promise<Array<Pick<TVShow, 'id' | 'mediaId'>>> {
    if (mediaIds.length === 0) {
      return [];
    }
    return this.tvShowRepository
      .createQueryBuilder('tvShow')
      .select(['tvShow.id', 'tvShow.mediaId'])
      .where('tvShow.tmdbId IN (:...mediaIds)', { mediaIds })
      .getMany();
  }

  /** Mirrors a catalog tv show detail into the local index (upsert by mediaId). */
  async upsertTVShowDetail(detail: TVShowDetail): Promise<TVShow> {
    return this.database.transaction(async manager => {
      const tvShowRepo = manager.getRepository(TVShow);
      const existing = await tvShowRepo.findOneBy({ mediaId: detail.mediaId });
      const payload = {
        mediaId: detail.mediaId,
        name: detail.name,
        overview: detail.overview,
        firstAirDate: detail.firstAirDate,
        poster: detail.poster,
        backdrop: detail.backdrop,
        imdbId: detail.imdbId ?? '',
        status: detail.status,
        popularity: detail.popularity,
        rating: detail.rating,
      };
      let show: TVShow;
      if (existing) {
        await tvShowRepo.update(existing.id, payload);
        show = { ...existing, ...payload };
      } else {
        show = await tvShowRepo.save(tvShowRepo.create(payload));
      }
      for (const season of detail.seasons) {
        await this.upsertSeasonSummary(manager, show, season);
      }
      return show;
    });
  }

  /** Upserts season metadata without touching synced state or stored episodes. */
  private async upsertSeasonSummary(
    manager: EntityManager,
    show: TVShow,
    season: TVShowDetail['seasons'][number]
  ): Promise<void> {
    const seasonRepo = manager.getRepository(Season);
    const existing = await seasonRepo.findOneBy({
      tvShowId: show.id,
      seasonNumber: season.seasonNumber,
    });
    const payload = {
      mediaId: season.mediaId,
      name: season.name,
      overview: season.overview,
      airDate: season.airDate ?? undefined,
      posterPath: season.poster ?? undefined,
    };
    if (existing) {
      await seasonRepo.update(existing.id, payload);
    } else {
      await seasonRepo.save(
        seasonRepo.create({ ...payload, tvShowId: show.id, seasonNumber: season.seasonNumber })
      );
    }
  }

  /** Mirrors a catalog season (with episodes) into the local index. */
  async upsertSeasonDetail(detail: SeasonDetail): Promise<Season> {
    return this.database.transaction(async manager => {
      const tvShowRepo = manager.getRepository(TVShow);
      const show = await tvShowRepo.findOneBy({ mediaId: detail.tvMediaId });
      if (!show) {
        throw new RepositoryError(
          `Cannot mirror season of unknown show ${detail.tvMediaId}`,
          'not_found'
        );
      }
      const seasonRepo = manager.getRepository(Season);
      const existingSeason = await seasonRepo.findOneBy({
        tvShowId: show.id,
        seasonNumber: detail.seasonNumber,
      });
      const payload = {
        mediaId: detail.seasonMediaId,
        name: detail.name,
        overview: detail.overview,
        airDate: detail.airDate ?? undefined,
        posterPath: detail.poster ?? undefined,
        synced: true,
      };
      let season: Season;
      if (existingSeason) {
        await seasonRepo.update(existingSeason.id, payload);
        season = { ...existingSeason, ...payload };
      } else {
        season = await seasonRepo.save(
          seasonRepo.create({
            ...payload,
            tvShowId: show.id,
            seasonNumber: detail.seasonNumber,
          })
        );
      }
      const episodeRepo = manager.getRepository(Episode);
      const existingEpisodes = await episodeRepo.findBy({ seasonId: season.id });
      const existingByNumber = new Map(
        existingEpisodes.map(episode => [episode.episodeNumber, episode])
      );
      const retainedIds = new Set<number>();
      for (const episode of detail.episodes) {
        const existing = existingByNumber.get(episode.episodeNumber);
        const episodePayload = {
          mediaId: episode.mediaId,
          episodeNumber: episode.episodeNumber,
          name: episode.name,
          overview: episode.overview,
          airDate: episode.airDate,
          stillPath: episode.still ?? '',
          imdbId: '',
        };
        if (existing) {
          await episodeRepo.update(existing.id, episodePayload);
          retainedIds.add(existing.id);
        } else {
          await episodeRepo.save(episodeRepo.create({ ...episodePayload, seasonId: season.id }));
        }
      }
      const staleIds = existingEpisodes
        .filter(episode => !retainedIds.has(episode.id))
        .map(episode => episode.id);
      if (staleIds.length > 0) {
        await episodeRepo.delete({ id: In(staleIds) });
      }
      return season;
    });
  }

  async updateFromSummary(mediaId: number, tvShow: Partial<TVShow>): Promise<void> {
    await this.tvShowRepository.update({ mediaId }, tvShow);
  }

  async createFromSummary(tvShow: Partial<TVShow>): Promise<TVShow> {
    const created = this.tvShowRepository.create({
      backdrop: '',
      firstAirDate: '',
      imdbId: '',
      name: '',
      overview: '',
      popularity: 0,
      poster: '',
      rating: 0,
      status: '',
      ...tvShow,
    });
    await this.tvShowRepository
      .createQueryBuilder()
      .insert()
      .into(TVShow)
      .values(created)
      .orUpdate(
        ['name', 'overview', 'firstAirDate', 'poster', 'backdrop', 'popularity', 'rating'],
        // orUpdate expects database column names; the column predates the mediaId rename.
        ['tmdbId']
      )
      .updateEntity(false)
      .execute();
    const stored = await this.tvShowRepository.findOneBy({ mediaId: created.mediaId });
    if (!stored) {
      throw new RepositoryError('Failed to persist TV show summary', 'retrieve_failed');
    }
    return stored;
  }

  async findIncompleteSeason(): Promise<Season | null> {
    return this.seasonRepository.findOne({
      where: { synced: false },
      relations: {
        tvShow: true,
      },
    });
  }

  async findIncompleteSeasonByShowIds(showIds: number[]): Promise<Season | null> {
    if (showIds.length === 0) {
      return null;
    }

    return this.seasonRepository.findOne({
      where: {
        synced: false,
        tvShow: { id: In(showIds) },
      },
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

  async findSeasonByIdWithEpisodes(id: number): Promise<Season | null> {
    return this.seasonRepository.findOne({
      where: { id },
      relations: { episodes: true },
    });
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
    { episodes = [], manager }: { episodes?: Partial<Episode>[]; manager?: EntityManager } = {}
  ): Promise<Season> {
    const seasonRepository = manager ? manager.getRepository(Season) : this.seasonRepository;
    const existingSeason = await seasonRepository.findOne({
      where: {
        tvShowId: tvShow.id,
        seasonNumber: seasonData.seasonNumber,
      },
    });

    if (existingSeason) {
      return existingSeason;
    }

    const newSeason = seasonRepository.create({
      ...seasonData,
      tvShowId: tvShow.id,
      synced: false,
    });

    const savedSeason = await seasonRepository.save(newSeason);

    if (episodes.length) {
      savedSeason.episodes = await Promise.all(
        episodes.map(episode => this.createEpisode(savedSeason, episode, manager))
      );
    }

    return savedSeason;
  }

  async createEpisode(
    season: Season,
    episodeData: Partial<Episode>,
    manager?: EntityManager
  ): Promise<Episode> {
    const episodeRepository = manager ? manager.getRepository(Episode) : this.episodeRepository;
    const existingEpisode = await episodeRepository.findOne({
      where: {
        seasonId: season.id,
        episodeNumber: episodeData.episodeNumber,
      },
    });

    if (existingEpisode) {
      await episodeRepository.update(existingEpisode.id, episodeData);
      return Object.assign(existingEpisode, episodeData);
    }

    const newEpisode = episodeRepository.create({
      ...episodeData,
      seasonId: season.id,
    });

    return await episodeRepository.save(newEpisode);
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

  /** Catalog media ids of shows marked as watching (used to push the watching set). */
  async getWatchingTVShowMediaIds(): Promise<number[]> {
    const watchingShows = await this.tvShowRepository.find({
      where: { watching: true },
      select: ['mediaId'],
    });

    return watchingShows.map(show => show.mediaId);
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
