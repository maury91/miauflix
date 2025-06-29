import { Quality, Source, VideoCodec } from '@miauflix/source-metadata-extractor';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  type Relation,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

import type { EncryptionService } from '@services/encryption/encryption.service';

import { Movie } from './movie.entity';

export type MovieSourceQuality = Quality | '3D';
const QUALITIES: MovieSourceQuality[] = [
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
];

/**
 * Movie source entity to store information about available sources for movies
 */

@Entity()
@Unique(['movieId', 'hash']) // avoid duplicates per film
@Index('idx_movie_rank', ['movieId', 'resolution', 'broadcasters', 'size'])
@Index('idx_movie_source_no_file', ['movieId'], { where: '"file" IS NULL' }) // fast "file IS NULL" scans - partial index
export class MovieSource {
  static encryptionService: EncryptionService;

  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Movie, movie => movie.sources, { onDelete: 'CASCADE' })
  movie: Relation<Movie>;

  @Column()
  movieId: number;

  @Column({
    length: 92,
    name: 'ih',
    transformer: {
      to: (value: string) => MovieSource.encryptionService.encryptString(value, true),
      from: (value: string) => MovieSource.encryptionService.decryptString(value),
    },
  })
  hash: string;

  @Column({
    name: 'ml',
    transformer: {
      to: (value: string) => MovieSource.encryptionService.encryptString(value),
      from: (value: string) => MovieSource.encryptionService.decryptString(value),
    },
  })
  magnetLink: string;

  @Column({
    nullable: true,
    name: 'u',
    transformer: {
      to: (value?: string) =>
        value ? MovieSource.encryptionService.encryptString(value) : undefined,
      from: (value?: string) =>
        value ? MovieSource.encryptionService.decryptString(value) : undefined,
    },
  })
  url?: string; // URI link to the source, if available

  // URI link to the source, if available
  @Column({
    type: 'int',
    nullable: true,
    transformer: {
      to: (value: MovieSourceQuality | null) => (value ? QUALITIES.indexOf(value) : undefined),
      from: (value?: number) => (value ? QUALITIES[value] : undefined),
    },
  })
  quality: MovieSourceQuality | null;

  @Column()
  resolution: number; // Vertical resolution in pixels ( used for sorting and filtering )

  @Column()
  size: number; // Size in bytes

  @Column({
    nullable: true,
    type: 'int',
    transformer: {
      to: (value: VideoCodec | null) => (value ? VIDEO_CODECS.indexOf(value) : undefined),
      from: (value?: number) => (value ? VIDEO_CODECS[value] : undefined),
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
      from: (value?: number) => (value ? SOURCE_TYPES[value] : undefined),
    },
  })
  sourceType: Source | null; // e.g. "web", "cam", "bluray", "dvd", ...

  @Column({
    type: 'blob',
    nullable: true,
    transformer: {
      to: (value?: Buffer) =>
        value ? MovieSource.encryptionService.encryptBuffer(value) : undefined,
      from: (value?: Buffer) =>
        value ? MovieSource.encryptionService.decryptBuffer(value) : undefined,
    },
  })
  file?: Buffer;

  @Column({ type: 'datetime', nullable: true })
  sourceUploadedAt?: Date;

  @Column({ type: 'datetime', nullable: true })
  lastStatsCheck?: Date;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  nextStatsCheckAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToOne('Storage', 'movieSource')
  storage?: object;
}
