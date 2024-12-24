import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MovieSource } from './movie.source.entity';
import { PartialKeys } from '../../../helper.types';
import { MovieProgress } from './movie.progress.entity';

@Entity()
export class Movie {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    unique: true,
  })
  slug: string;

  @Column()
  title: string;

  @Column()
  year: number;

  @Column('text')
  overview: string;

  @Column()
  runtime: number;

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
  })
  rating: number;

  @Column()
  traktId: number;

  @Column({
    nullable: true,
  })
  imdbId?: string;

  @Column({
    nullable: true,
  })
  tmdbId?: number;

  @Column()
  poster: string;

  @Column()
  backdrop: string;

  @Column({
    type: 'varchar',
    array: true,
  })
  backdrops: string[];

  @Column({
    type: 'varchar',
    array: true,
  })
  logos: string[];

  @Column({
    type: 'boolean',
    default: false,
  })
  sourcesSearched = false;

  @Column({
    type: 'boolean',
    default: false,
  })
  noSourceFound = false;

  @Column({
    type: 'boolean',
    default: false,
  })
  sourceFound = false;

  @OneToMany(() => MovieSource, (movieSource) => movieSource.movie)
  sources: MovieSource[];

  @Column({
    type: 'varchar',
    array: true,
  })
  genres: string[];

  @OneToMany(() => MovieProgress, (movieProgress) => movieProgress.movie)
  progress: MovieProgress[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

export type MovieCreationAttributes = PartialKeys<
  Omit<Movie, 'id' | 'sources' | 'createdAt' | 'updatedAt' | 'progress'>,
  'noSourceFound' | 'sourceFound' | 'sourcesSearched'
>;
