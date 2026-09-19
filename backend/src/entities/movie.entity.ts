import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';

import type { EncryptionService } from '@services/encryption/encryption.service';

import { MovieSource } from './movie-source.entity';

/**
 * Local index of catalog movies.
 *
 * Catalog data (full details, translations, genres) lives in the media-catalog
 * service; this slim mirror keeps only what the backend's own SQL joins need —
 * source discovery, streaming and ranking read it locally. It is written through
 * the media-catalog service responses (see media-index.service.ts).
 */
@Entity()
export class Movie {
  static encryptionService: EncryptionService;

  /** IDs */
  @PrimaryGeneratedColumn()
  id: number;

  /** Catalog media id (column name kept for existing databases). */
  @Column({
    unique: true,
    name: 'tmdbId',
  })
  mediaId: number;

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

  /** Images */

  @Column()
  poster: string;

  @Column()
  backdrop: string;

  /** Status */

  @Column({
    type: 'simple-json',
    default: '[]',
  })
  contentDirectoriesSearched: string[];

  @Column({
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
  })
  nextSourceSearchAt: Date;

  @OneToMany(() => MovieSource, source => source.movie)
  sources: Relation<MovieSource>[];

  /** Time */

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
