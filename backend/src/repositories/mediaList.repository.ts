import type { Repository } from 'typeorm';

import type { Database } from '@database/database';
import { MediaList } from '@entities/list.entity';

export class MediaListRepository {
  private readonly repository: Repository<MediaList>;

  constructor(db: Database) {
    this.repository = db.getRepository(MediaList);
  }

  async findByName(name: string): Promise<MediaList | null> {
    return this.repository.findOne({ where: { name } });
  }

  async findBySlug(slug: string, preload: boolean): Promise<MediaList | null> {
    const qb = this.repository.createQueryBuilder('list').where('list.slug = :slug', { slug });

    if (preload) {
      qb.leftJoinAndSelect('list.movies', 'movies')
        .leftJoinAndSelect('movies.genres', 'movieGenres')
        .leftJoinAndSelect('movies.translations', 'movieTranslations')
        .leftJoinAndSelect('list.tvShows', 'tvShows')
        .leftJoinAndSelect('tvShows.genres', 'tvShowGenres')
        .leftJoinAndSelect('tvShows.translations', 'tvShowTranslations')
        .leftJoinAndSelect('tvShows.seasons', 'seasons')
        .leftJoinAndSelect('list.seasons', 'listSeasons');
    }

    return qb.getOne();
  }

  async saveMediaList(mediaList: MediaList): Promise<MediaList> {
    return this.repository.save(mediaList);
  }

  createMediaList(name: string, description: string, slug: string): Promise<MediaList> {
    const mediaList = this.repository.create({
      name,
      description,
      slug,
      movies: [],
      tvShows: [],
      seasons: [],
    });
    return this.saveMediaList(mediaList);
  }
}
