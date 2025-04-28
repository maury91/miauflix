import { objectKeys } from "src/utils/object.util";
import type { DataSource, Repository } from "typeorm";

import { Episode } from "@entities/episode.entity";
import type { Genre } from "@entities/genre.entity";
import { Season } from "@entities/season.entity";
import { TVShow } from "@entities/tvshow.entity";
import { TVShowTranslation } from "@entities/tvshow.entity";

export class TVShowRepository {
  private readonly tvShowRepository: Repository<TVShow>;
  private readonly seasonRepository: Repository<Season>;
  private readonly episodeRepository: Repository<Episode>;
  private readonly tvShowTranslationRepository: Repository<TVShowTranslation>;

  constructor(datasource: DataSource) {
    this.tvShowRepository = datasource.getRepository(TVShow);
    this.tvShowTranslationRepository =
      datasource.getRepository(TVShowTranslation);
    this.seasonRepository = datasource.getRepository(Season);
    this.episodeRepository = datasource.getRepository(Episode);
  }

  async findByTMDBId(tmdbId: number): Promise<TVShow | null> {
    return this.tvShowRepository.findOne({
      where: { tmdbId },
      relations: {
        translations: true,
        seasons: {
          episodes: true,
        },
      },
    });
  }

  async create(tvShow: Partial<TVShow>): Promise<TVShow> {
    const newTVShow = this.tvShowRepository.create(tvShow);
    return this.tvShowRepository.save(newTVShow);
  }

  async addTranslation(
    tvShow: TVShow,
    translation: Partial<TVShowTranslation>,
  ): Promise<TVShowTranslation> {
    const newTranslation = this.tvShowTranslationRepository.create({
      ...translation,
      tvShow,
    });
    await this.tvShowTranslationRepository.upsert(newTranslation, [
      "tvShowId",
      "language",
    ]);

    return newTranslation;
  }

  async checkForChangesAndUpdate(
    tvShow: TVShow,
    updatedTVShow: Partial<TVShow>,
  ): Promise<void> {
    const hasChanges = objectKeys(updatedTVShow).some((key) => {
      return tvShow[key] !== updatedTVShow[key];
    });
    if (hasChanges) {
      await this.tvShowRepository.update(tvShow.id, updatedTVShow);
    }
  }

  async saveTVShow(tvShow: TVShow): Promise<TVShow> {
    return this.tvShowRepository.save(tvShow);
  }

  async createSeason(
    tvShow: TVShow,
    seasonData: Partial<Season>,
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
    });

    return await this.seasonRepository.save(newSeason);
  }

  async createEpisode(
    season: Season,
    episodeData: Partial<Episode>,
  ): Promise<Episode> {
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

  async updateGenres(show: TVShow, genres: Genre[]): Promise<void> {
    const updatedShow = await this.tvShowRepository.findOneBy({
      id: show.id,
    });
    if (!updatedShow) {
      throw new Error("TV Show not found");
    }
    updatedShow.genres = genres;
    await this.tvShowRepository.save(updatedShow);
  }
}
