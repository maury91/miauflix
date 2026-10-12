import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

import { Episode } from './episode.entity';
import { MovieSource } from './movie-source.entity';

/** Maps a playable episode to its exact video file within a shared torrent. */
@Entity()
@Unique(['episodeId', 'sourceId', 'videoFilePath'])
@Index(['episodeId', 'sourceId'])
export class EpisodeSource {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Episode, { onDelete: 'CASCADE' })
  episode: Relation<Episode>;

  @Column()
  episodeId: number;

  @ManyToOne(() => MovieSource, { onDelete: 'CASCADE' })
  source: Relation<MovieSource>;

  @Column()
  sourceId: number;

  /** Null only for the single video in a release whose provider omitted file names. */
  @Column({ type: 'text', nullable: true })
  videoFilePath: string | null;

  /** Combined episode videos are only used as a fallback and have no known boundaries. */
  @Column({ length: 16, default: 'single' })
  matchKind: 'combined' | 'single';

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
