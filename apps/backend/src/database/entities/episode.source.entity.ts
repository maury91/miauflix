import { Episode } from './episode.entity';
import { VideoSource } from '../../app/jackett/jackett.types';
import { VideoCodec, VideoQuality } from '@miauflix/types';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PartialKeys } from '../../helper.types';

@Entity()
export class EpisodeSource {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Episode, (episode) => episode.sources)
  @JoinColumn({ name: 'episodeId', referencedColumnName: 'id' })
  episode: Episode;

  @Column()
  episodeId: number;

  @Column()
  showSlug: string;

  @Column({
    type: 'boolean',
    default: false,
  })
  rejected = false;

  @Column('smallint')
  seasonNum: number;

  @Column('smallint')
  episodeNum: number;

  @Column()
  originalSource: string;

  @Column({
    type: 'varchar',
    array: true,
    length: 500,
  })
  videos: string[];

  @Column('bigint')
  size!: number;

  @Column({
    type: 'bytea',
    nullable: true,
  })
  data?: Buffer;

  @Column({
    type: 'bytea',
    nullable: true,
  })
  downloaded?: Buffer;

  @Column({
    type: 'decimal',
    precision: 4,
    scale: 1,
    default: 0,
  })
  downloadPercentage = 0;

  @Column({
    type: 'varchar',
    nullable: true,
  })
  downloadedPath?: string;

  @Column({
    type: 'enum',
    enum: ['created', 'downloading', 'completed'],
    default: 'created',
  })
  status?: 'created' | 'downloading' | 'completed' = 'created';

  @Column({
    nullable: true,
  })
  lastUsedAt?: Date;

  @Column('smallint')
  quality: VideoQuality;

  @Column({
    type: 'int',
    unsigned: true,
    default: 0,
  })
  availability: number;

  @Column({
    type: 'varchar',
    length: 20,
  })
  codec: VideoCodec;

  @Column({
    type: 'varchar',
    length: 20,
  })
  source: VideoSource;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

export type EpisodeSourceCreationAttributes = PartialKeys<
  Omit<EpisodeSource, 'id' | 'episode'>,
  'createdAt' | 'updatedAt' | 'rejected' | 'downloadPercentage'
>;
