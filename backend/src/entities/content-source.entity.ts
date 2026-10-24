import { Quality, Source, VideoCodec } from '@miauflix/source-metadata-extractor';
import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  type Relation,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

import type { EncryptionService } from '@services/encryption/encryption.service';
import { normalizeInfoHash } from '@utils/transformers.util';

import type { EpisodeSource } from './episode-source.entity';
import type { MovieSource } from './movie-source.entity';

export type SourceQuality = Quality | '3D';
export const QUALITIES: SourceQuality[] = [
  Quality.SD,
  Quality.HD,
  Quality.FHD,
  Quality['2K'],
  Quality['4K'],
  Quality['8K'],
  '3D',
];

const VIDEO_CODECS: VideoCodec[] = [
  VideoCodec.VC1,
  VideoCodec.MPEG2,
  VideoCodec.MPEG4,
  VideoCodec.XVID,
  VideoCodec.VP8,
  VideoCodec.VP9,
  VideoCodec.X264,
  VideoCodec.X265,
  VideoCodec.AV1,
  VideoCodec.X264_10BIT,
  VideoCodec.X265_10BIT,
  VideoCodec.AV1_10BIT,
];

const SOURCE_TYPES: Source[] = [
  Source.WEB,
  Source.BLURAY,
  Source.HDTV,
  Source.DVD,
  Source.TS,
  Source.CAM,
  Source.DCP,
];

/**
 * Where content can be fetched from, as reported by a content provider. Today every
 * source is a torrent identified by its (lowercase) info hash; other kinds of source
 * (for example a link to a streaming service) can be added here later.
 * Movies and episodes reference it through MovieSource and EpisodeSource.
 */
@Entity('content_source')
@Unique(['hash'])
export class ContentSource {
  static encryptionService: EncryptionService;

  @PrimaryGeneratedColumn()
  id: number;

  @OneToMany('MovieSource', 'source')
  movies?: Relation<MovieSource>[];

  @OneToMany('EpisodeSource', 'source')
  episodes?: Relation<EpisodeSource>[];

  @Column({
    length: 92,
    name: 'ih',
    transformer: {
      // Normalize before the deterministic encryption so every write and lookup by hash
      // agrees on one ciphertext, whatever casing the provider used.
      to: (value: string) =>
        ContentSource.encryptionService.encryptString(normalizeInfoHash(value), true),
      from: (value: string) => ContentSource.encryptionService.decryptString(value),
    },
  })
  hash: string;

  @Column({
    name: 'ml',
    transformer: {
      to: (value: string) => ContentSource.encryptionService.encryptString(value),
      from: (value: string) => ContentSource.encryptionService.decryptString(value),
    },
  })
  magnetLink: string;

  @Column({
    nullable: true,
    name: 'u',
    transformer: {
      to: (value?: string) =>
        value ? ContentSource.encryptionService.encryptString(value) : undefined,
      from: (value?: string) =>
        value ? ContentSource.encryptionService.decryptString(value) : undefined,
    },
  })
  url?: string; // URI link to the source, if available

  // URI link to the source, if available
  @Column({
    type: 'int',
    nullable: true,
    transformer: {
      to: (value: SourceQuality | null) => (value ? QUALITIES.indexOf(value) : undefined),
      from: (value?: number | null) =>
        value !== undefined && value !== null ? QUALITIES[value] : null,
    },
  })
  quality: SourceQuality | null;

  @Column()
  size: number; // Size in bytes

  @Column({
    nullable: true,
    type: 'int',
    transformer: {
      to: (value: VideoCodec | null) => (value ? VIDEO_CODECS.indexOf(value) : undefined),
      from: (value?: number | null) =>
        value !== undefined && value !== null ? VIDEO_CODECS[value] : null,
    },
  })
  videoCodec: VideoCodec | null; // e.g. "x264", "x265", "HVEC"

  @Column({ nullable: true })
  broadcasters?: number;

  @Column({ nullable: true })
  watchers?: number;

  @Column()
  source: string; // YTS, TheRARBG, etc.

  @Column({
    type: 'int',
    nullable: true,
    transformer: {
      to: (value: Source | null) => (value ? SOURCE_TYPES.indexOf(value) : undefined),
      from: (value?: number | null) =>
        value !== undefined && value !== null ? SOURCE_TYPES[value] : null,
    },
  })
  sourceType: Source | null; // e.g. "web", "cam", "bluray", "dvd", ...

  @Column({
    type: 'blob',
    nullable: true,
    transformer: {
      to: (value?: Buffer) =>
        value ? ContentSource.encryptionService.encryptBuffer(value) : undefined,
      from: (value?: Buffer) =>
        value ? ContentSource.encryptionService.decryptBuffer(value) : undefined,
    },
  })
  file?: Buffer;

  @Column({ type: 'datetime', nullable: true })
  sourceUploadedAt?: Date;

  @Column({
    type: 'int',
    default: 0,
  })
  streamingScore: number;

  @Column({ type: 'datetime', nullable: true })
  lastStatsCheck?: Date;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  nextStatsCheckAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToOne('Storage', 'contentSource')
  storage?: object;
}
