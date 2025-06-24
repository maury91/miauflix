import { Quality } from '@miauflix/source-metadata-extractor';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  type Relation,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

import type { EncryptionService } from '@services/encryption/encryption.service';

import { Movie } from './movie.entity';

/**
 * Movie source entity to store information about available sources for movies
 */

@Entity()
@Unique(['movieId', 'hash']) // avoid duplicates per film
@Index('idx_movie_rank', ['movieId', 'resolution', 'broadcasters', 'size'])
@Index('idx_movie_file', ['movieId', 'file']) // fast "file IS NULL" scans
export class MovieSource {
  static encryptionService: EncryptionService;

  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Movie, movie => movie.sources, { onDelete: 'CASCADE' })
  movie: Relation<Movie>;

  @Column()
  movieId: number;

  @Column({
    length: 92,
    name: 'ih',
    transformer: {
      to: (value: string) => MovieSource.encryptionService.encryptString(value, true),
      from: (value: string) => MovieSource.encryptionService.decryptString(value),
    },
  })
  hash: string;

  @Column({
    name: 'ml',
    transformer: {
      to: (value: string) => MovieSource.encryptionService.encryptString(value),
      from: (value: string) => MovieSource.encryptionService.decryptString(value),
    },
  })
  magnetLink: string;

  @Column({
    nullable: true,
    name: 'u',
    transformer: {
      to: (value?: string) =>
        value ? MovieSource.encryptionService.encryptString(value) : undefined,
      from: (value?: string) =>
        value ? MovieSource.encryptionService.decryptString(value) : undefined,
    },
  })
  url?: string; // URI link to the source, if available

  // URI link to the source, if available
  @Column({
    type: 'varchar',
    nullable: true,
  })
  quality: Quality | null;

  @Column()
  resolution: number; // Vertical resolution in pixels ( used for sorting and filtering )

  @Column()
  size: number; // Size in bytes

  @Column({ nullable: true, type: 'varchar', length: 10 })
  videoCodec: string | null; // e.g. "x264", "x265", "HVEC"

  @Column({ nullable: true })
  broadcasters?: number;

  @Column({ nullable: true })
  watchers?: number;

  @Column()
  source: string; // YTS, TheRARBG, etc.

  @Column({
    type: 'varchar',
    nullable: true,
  })
  sourceType: string | null; // e.g. "web", "cam", "bluray", "dvd", ...

  @Column({
    type: 'blob',
    nullable: true,
    transformer: {
      to: (value?: Buffer) =>
        value ? MovieSource.encryptionService.encryptBuffer(value) : undefined,
      from: (value?: Buffer) =>
        value ? MovieSource.encryptionService.decryptBuffer(value) : undefined,
    },
  })
  file?: Buffer;

  @Column({ type: 'datetime', nullable: true })
  sourceUploadedAt?: Date;

  @Column({ type: 'datetime', nullable: true })
  lastStatsCheck?: Date;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  nextStatsCheckAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToOne('Storage', 'movieSource')
  storage?: object;
}
