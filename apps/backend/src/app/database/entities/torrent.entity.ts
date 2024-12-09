import {
  BelongsTo,
  Column,
  DataType,
  Default,
  ForeignKey,
  Model,
  Table,
  Unique,
} from 'sequelize-typescript';
import { Movie } from './movie.entity';
import { VideoSource } from '../../jackett/jackett.types';
import { VideoCodec, VideoQuality } from '@miauflix/types';
import { Show } from './show.entity';
import { Season } from './season.entity';
import { Episode } from './episode.entity';

export interface TorrentAttributes {
  id: number;
  movieId?: number;
  movie?: Movie;
  showId?: number;
  seasonId?: number;
  episodeId?: number;
  seasonNum?: number;
  episodeNum?: number;
  episode?: Episode;
  runtime: number;
  mediaSlug: string;
  title: string;
  uuid: string;
  pubDate: Date;
  size: number;
  url: string;
  urlType: string;
  tracker: string;
  seeders: number;
  peers: number;
  quality: VideoQuality;
  codec: VideoCodec;
  source: VideoSource;
  processed: boolean;
  rejected: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type TorrentCreationAttributes = Omit<
  TorrentAttributes,
  | 'id'
  | 'createdAt'
  | 'updatedAt'
  | 'processed'
  | 'rejected'
  | 'movie'
  | 'episode'
>;

@Table
export class Torrent extends Model {
  @ForeignKey(() => Movie)
  movieId?: number;

  @BelongsTo(() => Movie)
  movie?: Movie;

  @ForeignKey(() => Show)
  showId?: number;

  @ForeignKey(() => Season)
  seasonId?: number;

  @ForeignKey(() => Episode)
  episodeId?: number;

  @BelongsTo(() => Episode)
  episode?: Episode;

  @Column
  seasonNum?: number;

  @Column
  episodeNum?: number;

  @Column
  runtime!: number;

  @Column
  mediaSlug!: string;

  @Column
  title!: string;

  @Unique
  @Column
  uuid!: string;

  @Column
  pubDate!: Date;

  @Column(DataType.BIGINT)
  size!: number;

  @Column(DataType.TEXT)
  url!: string;

  @Column
  urlType!: string;

  @Column
  tracker!: string;

  @Column
  seeders!: number;

  @Column
  peers!: number;

  @Column(DataType.SMALLINT)
  quality!: VideoQuality;

  @Column(DataType.STRING)
  codec!: VideoCodec;

  @Column(DataType.STRING)
  source!: VideoSource;

  @Default(false)
  @Column
  processed!: boolean;

  @Default(false)
  @Column
  rejected!: boolean;
}
