import { Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { encryptedText } from '@utils/encrypted-column.util';

/** `original`: the file as downloaded. `remux`: its TV version, built by media-load. */
export type MediaVariantKind = 'original' | 'remux';
/** A TV version is `building` while queued or written, then `ready`; an original is `ready`. */
export type MediaVariantState = 'building' | 'ready';

/**
 * A playable version of a source's file and the codecs it holds, so a source can be judged by
 * what it plays as: a file whose audio a TV cannot decode plays natively once its TV version
 * exists, or soon, while that version is being built.
 */
@Entity()
@Index(['sourceId', 'filePath', 'kind'], { unique: true })
export class MediaVariant {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  sourceId: number;

  @Column({ type: 'text', name: 'k', transformer: encryptedText({ deterministic: true }) })
  filePath: string;

  @Column({ type: 'varchar' })
  kind: MediaVariantKind;

  @Column({ type: 'varchar' })
  state: MediaVariantState;

  /** ffprobe's `format_name` ("matroska,webm", "mpegts"); null when unknown. */
  @Column({ type: 'varchar', nullable: true })
  container: string | null;

  /** ffprobe's `codec_name` of the video ("hevc"); null when the file has none. */
  @Column({ type: 'varchar', nullable: true })
  videoCodec: string | null;

  /** ffprobe's `codec_name` of each audio track, in order. */
  @Column({ type: 'simple-json' })
  audioCodecs: string[];

  @UpdateDateColumn()
  updatedAt: Date;
}
