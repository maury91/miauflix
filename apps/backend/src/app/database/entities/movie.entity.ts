import {
  Column,
  DataType,
  Default,
  HasMany,
  Index,
  Model,
  Table,
} from 'sequelize-typescript';
import { Source } from './source.entity';

export interface MovieAttributes {
  id: number;
  slug: string;
  title: string;
  year: number;
  overview: string;
  runtime: number;
  trailer: string;
  rating: number;
  genres: string[];
  sourceFound: boolean;
  sourcesSearched: boolean;
  noSourceFound: boolean;
  traktId: number;
  imdbId: string;
  tmdbId: number;
  poster: string;
  backdrop: string;
  backdrops: string[];
  logos: string[];
  createdAt: Date;
  updatedAt: Date;
}

export type MovieCreationAttributes = Omit<
  MovieAttributes,
  | 'id'
  | 'createdAt'
  | 'updatedAt'
  | 'sourceFound'
  | 'sourcesSearched'
  | 'noSourceFound'
>;

@Table
export class Movie extends Model<MovieAttributes, MovieCreationAttributes> {
  @Index('movie_slug_index')
  @Column
  slug!: string;

  @Column
  title!: string;

  @Column
  year!: number;

  @Column(DataType.TEXT)
  overview!: string;

  @Column
  runtime!: number;

  @Column(DataType.STRING(500))
  trailer!: string;

  @Column(DataType.DECIMAL(3, 2))
  rating!: number;

  @Column
  traktId!: number;

  @Column
  imdbId!: string;

  @Column
  tmdbId!: number;

  @Column
  poster!: string;

  @Column
  backdrop!: string;

  @Column(DataType.ARRAY(DataType.STRING))
  backdrops!: string[];

  @Column(DataType.ARRAY(DataType.STRING))
  logos!: string[];

  @Default(false)
  @Column
  sourcesSearched: boolean;

  @Default(false)
  @Column
  noSourceFound: boolean;

  @Default(false)
  @Column
  sourceFound: boolean;

  @HasMany(() => Source)
  allSources: Source[];

  @Column(DataType.ARRAY(DataType.STRING))
  genres!: string[];
}
