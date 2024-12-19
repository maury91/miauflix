import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MovieSource } from './movie.source.entity';
import { PartialKeys } from '../../../helper.types';

@Entity()
export class Movie {
  @PrimaryGeneratedColumn()
  id: number;

  @PrimaryColumn()
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

  @Column()
  imdbId: string;

  @Column()
  tmdbId: number;

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
  sources: MovieSource[] = [];

  @Column({
    type: 'varchar',
    array: true,
  })
  genres: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

export type MovieCreationAttributes = PartialKeys<Omit<Movie, 'id' | 'sources' | 'createdAt' | 'updatedAt'>, 'noSourceFound' | 'sourceFound' | 'sourcesSearched'>;
