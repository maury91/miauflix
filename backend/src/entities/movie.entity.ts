import {
  Column,
  CreateDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

import type { EncryptionService } from '@services/encryption/encryption.service';

import { Genre } from './genre.entity';
import { MovieSource } from './movie-source.entity';

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
