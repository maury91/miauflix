import type { MediaRatingRef, MediaRatingValue } from '@mytypes/ratings.types';
import type { MediaRatingRepository } from '@repositories/media-rating.repository';

/** An account's like/love/dislike for a title; the account always comes from the session. */
export class MediaRatingService {
  constructor(private readonly ratings: MediaRatingRepository) {}

  get(userId: string, media: MediaRatingRef): Promise<MediaRatingValue | null> {
    return this.ratings.get(userId, media);
  }

  /** `null` clears the rating. */
  set(userId: string, media: MediaRatingRef, rating: MediaRatingValue | null): Promise<void> {
    return this.ratings.set(userId, media, rating);
  }
}
