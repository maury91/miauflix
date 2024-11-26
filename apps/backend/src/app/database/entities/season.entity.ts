import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  HasMany,
  Model,
  Table,
} from 'sequelize-typescript';
import { Show } from './show.entity';
import { Episode } from './episode.entity';

export interface SeasonAttributes {
  id: number;
  show: Show;
  showId: number;
  number: number;
  title: string;
  overview: string;
  episodesCount: number;
  airedEpisodes: number;
  rating: number;
  network: string;
  traktId: number;
  tvdbId: number;
  tmdbId: number;
  episodes: Episode[];
  createdAt: Date;
  updatedAt: Date;
}

export type SeasonCreationAttributes = Omit<
  SeasonAttributes,
  'id' | 'episodes' | 'createdAt' | 'updatedAt' | 'show'
>;

@Table
export class Season extends Model<SeasonAttributes, SeasonCreationAttributes> {
  @BelongsTo(() => Show)
  show!: Show;

  @ForeignKey(() => Show)
  showId!: number;

  @HasMany(() => Episode)
  episodes!: Episode[];

  @Column
  number!: number;

  @Column
  title!: string;

  @Column(DataType.TEXT)
  overview!: string;

  @Column
  episodesCount!: number;

  @Column
  airedEpisodes!: number;

  @Column(DataType.DECIMAL(3, 2))
  rating!: number;

  @Column
  network!: string;

  @Column
  traktId!: number;

  @Column
  tvdbId!: number;

  @Column
  tmdbId!: number;
}
