import {
  BelongsTo,
  Column,
  DataType,
  Default,
  HasMany,
  Model,
  Table,
  Unique,
} from 'sequelize-typescript';
import { Torrent } from './torrent.entity';

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
  noTorrentFound: boolean;
  torrentId?: number; // ToDo: Candidate for removal
  traktId: number;
  imdbId: string;
  tmdbId: number;
  poster: string;
  backdrop: string;
  logo: string;
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
  | 'noTorrentFound'
  | 'allTorrents'
>;

@Table
export class Movie extends Model<MovieAttributes, MovieCreationAttributes> {
  @Unique
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

  @Column
  logo!: string;

  @Default(false)
  @Column
  torrentsSearched: boolean;

  @Default(false)
  @Column
  noTorrentFound: boolean;

  @Default(false)
  @Column
  torrentFound: boolean;

  // ToDo: Candidate for removal
  @BelongsTo(() => Torrent, 'torrentId')
  torrent?: Torrent;

  @HasMany(() => Torrent)
  allTorrents: Torrent[];

  @Column(DataType.ARRAY(DataType.STRING))
  genres!: string[];
}
