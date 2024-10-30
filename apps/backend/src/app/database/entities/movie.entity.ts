import {
  Column,
  DataType,
  Default,
  HasMany,
  Index,
  Model,
  Table,
} from 'sequelize-typescript';
import { Torrent } from './torrent.entity';
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
  torrentFound: boolean;
  torrentsSearched: boolean;
  noSourceFound: boolean;
  torrentId?: number; // ToDo: Candidate for removal
  traktId: number;
  imdbId: string;
  tmdbId: number;
  poster: string;
  backdrop: string;
  backdrops: string[];
  logos: string[];
  allTorrents: Torrent[];
  createdAt: Date;
  updatedAt: Date;
}

export type MovieCreationAttributes = Omit<
  MovieAttributes,
  | 'id'
  | 'createdAt'
  | 'updatedAt'
  | 'torrentFound'
  | 'torrentsSearched'
  | 'noSourceFound'
  | 'allTorrents'
>;

@Table
export class Movie extends Model<MovieAttributes, MovieCreationAttributes> {
  @Index('slug_index')
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

  // ToDo: Rename into searchSourcesRequested
  @Default(false)
  @Column
  torrentsSearched: boolean;

  @Default(false)
  @Column
  noSourceFound: boolean;

  // ToDo: Rename into sourceFound
  @Default(false)
  @Column
  torrentFound: boolean;

  @HasMany(() => Source)
  allSources: Source[];

  @Column(DataType.ARRAY(DataType.STRING))
  genres!: string[];
}
