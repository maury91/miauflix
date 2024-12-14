import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript';
import { Episode } from './episode.entity';
import { VideoSource } from '../../jackett/jackett.types';
import { VideoCodec, VideoQuality } from '@miauflix/types';

export interface EpisodeSourceAttributes {
  id: number;
  episodeId: number;
  episode: Episode;
  showSlug: string;
  seasonNum: number;
  episodeNum: number;
  originalSource: string;
  rejected: boolean;
  size: number;
  data: Buffer;
  quality: VideoQuality;
  videos: string[];
  codec: VideoCodec;
  source: VideoSource;
  createdAt: Date;
  updatedAt: Date;
}

export type EpisodeSourceCreationAttributes = Omit<
  EpisodeSourceAttributes,
  'id' | 'createdAt' | 'updatedAt' | 'episode' | 'rejected'
>;

@Table
export class EpisodeSource extends Model<
  EpisodeSourceAttributes,
  EpisodeSourceCreationAttributes
> {
  @ForeignKey(() => Episode)
  episodeId!: number;

  @BelongsTo(() => Episode)
  episode: Episode;

  @Column
  showSlug!: string;

  @Column(DataType.BOOLEAN)
  rejected!: boolean;

  @Column(DataType.SMALLINT)
  seasonNum!: number;

  @Column(DataType.SMALLINT)
  episodeNum!: number;

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
