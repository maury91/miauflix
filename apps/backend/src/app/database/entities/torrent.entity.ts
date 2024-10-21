import {
  Column,
  DataType,
  Default,
  ForeignKey,
  Model,
  Table,
  Unique,
} from 'sequelize-typescript';
import { Movie } from './movie.entity';
import {
  VideoCodec,
  VideoQuality,
  VideoSource,
} from '../../jackett/jackett.types';

export interface TorrentAttributes {
  id: number;
  movieId?: number;
  title: string;
  uuid: string;
  pubDate: Date;
  size: number;
  url: string;
  urlType: string;
  tracker: string;
  data?: Buffer;
  seeders: number;
  peers: number;
  quality: VideoQuality;
  codec: VideoCodec;
  source: VideoSource;
  processed: boolean;
  skip: boolean;
  rejected: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type TorrentCreationAttributes = Omit<
  TorrentAttributes,
  'id' | 'createdAt' | 'updatedAt' | 'processed' | 'skip' | 'rejected'
>;

@Table
export class Torrent extends Model {
  @ForeignKey(() => Movie)
  movieId?: number;

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

  @Column(DataType.BLOB)
  data?: Buffer;

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
  skip!: boolean;

  @Default(false)
  @Column
  rejected!: boolean;
}
