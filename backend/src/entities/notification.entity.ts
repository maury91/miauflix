import type { Source } from '@miauflix/source-metadata-extractor';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  Unique,
} from 'typeorm';

import { encryptedText } from '@utils/encrypted-column.util';

import type { SourceQuality } from './content-source.entity';
import { User } from './user.entity';

export type NotificationType =
  | 'movie_quality_upgrade'
  | 'source_available'
  | 'tv_episode_available';

@Entity()
@Unique(['userId', 'dedupeKey'])
@Index(['userId', 'createdAt'])
@Index(['userId', 'readAt'])
export class Notification {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: Relation<User>;

  @Column({ length: 40 })
  dedupeKey: string;

  @Column({ length: 40 })
  type: NotificationType;

  @Column({ length: 8 })
  mediaType: 'movie' | 'tv';

  @Column({ type: 'integer' })
  mediaId: number;

  @Column({ name: 'a', transformer: encryptedText({ deterministic: false }) })
  title: string;

  @Column({ name: 'b', transformer: encryptedText({ deterministic: false }) })
  message: string;

  @Column({ type: 'integer', nullable: true })
  seasonNumber: number | null;

  @Column({ type: 'integer', nullable: true })
  episodeNumber: number | null;

  /** Resolution of the source the notification announces, when known. */
  @Column({ type: 'varchar', length: 8, nullable: true })
  quality: SourceQuality | null;

  /** Release type of the source the notification announces, when known. */
  @Column({ type: 'varchar', length: 8, nullable: true })
  sourceType: Source | null;

  /** Best release type before a quality upgrade. */
  @Column({ type: 'varchar', length: 8, nullable: true })
  previousSourceType: Source | null;

  @Column({ type: 'datetime', nullable: true })
  readAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
