import type { Repository } from 'typeorm';

import type { MediaList } from '@entities/list.entity';
import type { Database } from '@database/database';

export class MediaListRepository {
  private readonly repository: Repository<MediaList>;

  constructor(db: Database) {
    this.repository = db.getRepository(db.MediaList);
  }

  async findByName(name: string): Promise<MediaList | null> {
    return this.repository.findOne({ where: { name } });
  }

  async findBySlug(slug: string, preload: boolean): Promise<MediaList | null> {
    return this.repository.findOne({
      relations: {
        movies: preload
          ? {
              genres: true,
              translations: true,
            }
          : false,
        tvShows: preload
          ? {
              genres: true,
              translations: true,
              seasons: true,
            }
          : false,
        seasons: preload,
      },
      where: { slug },
    });
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
