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

import { User } from './user.entity';

export type NotificationType = 'movie_quality_upgrade' | 'tv_episode_available';

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

  @Column()
  title: string;

  @Column()
  message: string;

  @Column({ type: 'integer', nullable: true })
  seasonNumber: number | null;

  @Column({ type: 'integer', nullable: true })
  episodeNumber: number | null;

  @Column({ type: 'datetime', nullable: true })
  readAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
