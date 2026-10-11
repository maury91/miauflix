import { Column, Entity, ManyToOne, PrimaryColumn, type Relation } from 'typeorm';

import type { MediaRatingValue } from '@routes/ratings.types';

import { User } from './user.entity';

/** One durable rating per account and title, independent of provider ratings. */
@Entity('media_ratings')
export class MediaRating {
  @PrimaryColumn()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: Relation<User>;

  @PrimaryColumn({ type: 'varchar' })
  mediaType: 'movie' | 'tv';

  @PrimaryColumn({ type: 'integer' })
  mediaId: number;

  @Column({ type: 'varchar' })
  rating: MediaRatingValue;
}
