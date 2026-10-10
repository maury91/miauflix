import type { Repository } from 'typeorm';

import type { Database } from '@database/database';
import { MediaRating } from '@entities/media-rating.entity';
import type { MediaRatingRef, MediaRatingValue } from '@routes/ratings.types';

export class MediaRatingRepository {
  private readonly repository: Repository<MediaRating>;

  constructor(database: Database) {
    this.repository = database.getRepository(MediaRating);
  }

  async get(userId: string, media: MediaRatingRef): Promise<MediaRatingValue | null> {
    return (await this.repository.findOneBy({ userId, ...media }))?.rating ?? null;
  }

  async set(userId: string, media: MediaRatingRef, rating: MediaRatingValue | null): Promise<void> {
    if (rating === null) {
      await this.repository.delete({ userId, ...media });
    } else {
      await this.repository.upsert({ userId, ...media, rating }, [
        'userId',
        'mediaType',
        'mediaId',
      ]);
    }
  }
}
