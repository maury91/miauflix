import { objectKeys } from "src/utils/object.util";
import type { DataSource, Repository } from "typeorm";

import { TVShow } from "@entities/tvshow.entity";
import { TVShowTranslation } from "@entities/tvshow.entity";

export class TVShowRepository {
  private readonly tvShowRepository: Repository<TVShow>;
  private readonly tvShowTranslationRepository: Repository<TVShowTranslation>;

  constructor(datasource: DataSource) {
    this.tvShowRepository = datasource.getRepository(TVShow);
    this.tvShowTranslationRepository =
      datasource.getRepository(TVShowTranslation);
  }

  async findByTMDBId(tmdbId: number): Promise<TVShow | null> {
    return this.tvShowRepository.findOne({ where: { tmdbId } });
  }

  async create(tvShow: Partial<TVShow>): Promise<TVShow> {
    const newTVShow = this.tvShowRepository.create(tvShow);
    return this.tvShowRepository.save(newTVShow);
  }

  async addTranslation(
    tvShow: TVShow,
    translation: Partial<TVShowTranslation>,
  ): Promise<void> {
    const newTranslation = this.tvShowTranslationRepository.create({
      ...translation,
      tvShow,
    });
    await this.tvShowTranslationRepository.upsert(newTranslation, [
      "tvShowId",
      "language",
    ]);
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
}
