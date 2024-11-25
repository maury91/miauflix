import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript';
import { Movie } from './movie.entity';
import { VideoSource } from '../../jackett/jackett.types';
import { VideoCodec, VideoQuality } from '@miauflix/types';
import { Episode } from './episode.entity';

export interface SourceAttributes {
  id: number;
  movieId?: number;
  episodeId?: number;
  movieSlug: string;
  movie?: Movie;
  episode?: Episode;
  originalSource: string;
  size: number;
  data: Buffer;
  quality: VideoQuality;
  videos: string[];
  codec: VideoCodec;
  source: VideoSource;
  createdAt: Date;
  updatedAt: Date;
}

export type SourceCreationAttributes = Omit<
  SourceAttributes,
  'id' | 'createdAt' | 'updatedAt' | 'movie' | 'episode'
>;

@Table
export class Source extends Model<SourceAttributes, SourceCreationAttributes> {
  @ForeignKey(() => Movie)
  movieId?: number;

  @ForeignKey(() => Episode)
  episodeId?: number;

  @Column
  movieSlug: string;

  @BelongsTo(() => Movie)
  movie?: Movie;

  @BelongsTo(() => Episode)
  episode?: Episode;

  @Column
  originalSource!: string;

  @Column(DataType.ARRAY(DataType.STRING(500)))
  videos!: string[];

  @Column(DataType.BIGINT)
  size!: number;

  @Column(DataType.BLOB)
  data?: Buffer;

  @Column(DataType.SMALLINT)
  quality!: VideoQuality;

  @Column(DataType.STRING)
  codec!: VideoCodec;

  @Column(DataType.STRING)
  source!: VideoSource;
}
