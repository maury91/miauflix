import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  type Relation,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

import type { EncryptionService } from '@services/encryption/encryption.service';

import { Genre } from './genre.entity';

@Entity()
export class Movie {
  static encryptionService: EncryptionService;

  /** IDs */
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    unique: true,
  })
  tmdbId: number;

  @Column({
    unique: true,
    nullable: true,
    type: 'varchar',
    length: 11,
  })
  imdbId: string | null;

  /** Metadata */

  @Column()
  title: string;

  @Column('text')
  overview: string;

  @Column()
  runtime: number;

  @Column()
  tagline: string;

  // ToDo: Obtain data
  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  trailer: string;

  @Column({
    type: 'decimal',
    precision: 4,
    scale: 2,
    default: 0,
  })
  rating: number;

  @Column({
    type: 'float',
    default: 0,
  })
  popularity: number;

  @Column()
  releaseDate: string;

  @ManyToMany(() => Genre, {
    eager: true,
  })
  @JoinTable()
  genres: Relation<Genre>[];

  @OneToMany(() => MovieTranslation, translation => translation.movie, {
    eager: true,
  })
  translations: Relation<MovieTranslation>[];

  /** Images */

  @Column()
  poster: string;

  @Column()
  backdrop: string;

  @Column()
  logo: string;

  @Column({ default: false })
  sourceSearched: boolean;

  @OneToMany(() => MovieSource, source => source.movie)
  sources: Relation<MovieSource>[];

  /** Time */

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Unique(['movie', 'language'])
@Entity()
export class MovieTranslation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  language: string;

  @ManyToOne(() => Movie, movie => movie.translations)
  movie: Relation<Movie>;

  @Column()
  movieId: number;

  @Column('text')
  overview: string;

  @Column()
  title: string;

  @Column()
  tagline: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

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

  @Column()
  quality: string;

  @Column()
  resolution: number; // Vertical resolution in pixels ( used for sorting and filtering )

  @Column()
  size: number; // Size in bytes

  @Column()
  videoCodec: string; // e.g. "x264", "x265", "HVEC"

  @Column({ nullable: true })
  broadcasters?: number;

  @Column({ nullable: true })
  watchers?: number;

  @Column()
  source: string;

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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToOne('Storage', 'movieSource')
  storage?: object;
}
