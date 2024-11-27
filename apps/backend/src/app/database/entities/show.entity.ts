import {
  Column,
  DataType,
  Default,
  HasMany,
  Index,
  Model,
  Table,
} from 'sequelize-typescript';
import { Season } from './season.entity';
import { Episode } from './episode.entity';
import { NOW } from 'sequelize';

export interface ShowAttributes {
  id: number;
  slug: string;
  title: string;
  year: number;
  overview: string;
  runtime: number;
  trailer: string;
  network: string;
  status: string;
  rating: number;
  genres: string[];
  airedEpisodes: number;
  traktId: number;
  imdbId: string;
  tmdbId: number;
  tvdbId: number;
  poster: string;
  backdrop: string;
  backdrops: string[];
  logos: string[];
  seasonsCount: number;
  seasons: Season[];
  episodes: Episode[];
  lastCheckedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type ShowCreationAttributes = Omit<
  ShowAttributes,
  | 'id'
  | 'seasons'
  | 'episodes'
  | 'seasonsCount'
  | 'lastCheckedAt'
  | 'createdAt'
  | 'updatedAt'
>;

@Table
export class Show extends Model<ShowAttributes, ShowCreationAttributes> {
  @Index('show_slug_index')
  @Column
  slug!: string;

  @Column
  title!: string;

  @Column
  year!: number;

  @Column(DataType.TEXT)
  overview!: string;

  @Column
  network!: string;

  @Column
  status!: string;

  @Column
  runtime!: number;

  @Column(DataType.STRING(500))
  trailer!: string;

  @Column(DataType.DECIMAL(4, 2))
  rating!: number;

  @Column(DataType.SMALLINT)
  airedEpisodes!: number;

  @Column
  traktId!: number;

  @Column
  imdbId!: string;

  @Column
  tmdbId!: number;

  @Column
  tvdbId!: number;

  @Column
  poster!: string;

  @Column
  backdrop!: string;

  @Column(DataType.ARRAY(DataType.STRING))
  backdrops!: string[];

  @Column(DataType.ARRAY(DataType.STRING))
  logos!: string[];

  @Column(DataType.ARRAY(DataType.STRING))
  genres!: string[];

  @Default(0)
  @Column(DataType.SMALLINT)
  seasonsCount!: number;

  @Default(NOW)
  @Column
  lastCheckedAt!: Date;

  @HasMany(() => Season)
  seasons!: Season[];

  @HasMany(() => Episode)
  episodes!: Episode[];

  // Add last season aired at
  // Add last episode aired at
}
