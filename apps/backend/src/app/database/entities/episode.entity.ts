import {
  Column,
  DataType,
  Default,
  ForeignKey,
  HasMany,
  Index,
  Model,
  Table,
} from 'sequelize-typescript';
import { Source } from './source.entity';
import { Season } from './season.entity';
import { Show } from './show.entity';

export interface EpisodeAttributes {
  id: number;
  seasonId: number;
  showId: number;
  number: number;
  order: number;
  title: string;
  overview: string;
  rating: number;
  firstAired: Date;
  runtime: number;
  episodeType: string;
  sourceFound: boolean;
  sourcesSearched: boolean;
  noSourceFound: boolean;
  traktId: number;
  tmdbId: number;
  tvdbId: number;
  imdbId: string;
  sources: Source[];
  season: Season;
  show: Show;
  createdAt: Date;
  updatedAt: Date;
}

export type EpisodeCreationAttributes = Omit<
  EpisodeAttributes,
  | 'id'
  | 'createdAt'
  | 'updatedAt'
  | 'season'
  | 'show'
  | 'sources'
  | 'sourceFound'
  | 'sourcesSearched'
  | 'noSourceFound'
>;

@Table
export class Episode extends Model<
  EpisodeAttributes,
  EpisodeCreationAttributes
> {
  @ForeignKey(() => Show)
  showId!: number;

  @ForeignKey(() => Season)
  seasonId!: number;

  @Column(DataType.SMALLINT)
  number!: number;

  @Column(DataType.SMALLINT)
  order!: number;

  @Column
  title!: string;

  @Column(DataType.TEXT)
  overview!: string;

  @Column(DataType.DECIMAL(3, 2))
  rating!: number;

  @Column
  firstAired!: Date;

  @Column
  runtime!: number;

  @Column(DataType.STRING(30))
  episodeType!: string;

  @Default(false)
  @Column
  sourceFound!: boolean;

  @Default(false)
  @Column
  sourcesSearched!: boolean;

  @Default(false)
  @Column
  noSourceFound!: boolean;

  @HasMany(() => Source)
  sources!: Source[];
}
