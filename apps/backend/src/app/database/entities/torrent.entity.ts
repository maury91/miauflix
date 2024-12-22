import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { VideoSource } from '../../jackett/jackett.types';
import { VideoCodec, VideoQuality } from '@miauflix/types';
import { PartialKeys } from '../../../helper.types';

@Entity()
export class Torrent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    nullable: true,
  })
  movieId?: number;

  @Column({
    nullable: true,
  })
  showId?: number;

  @Column({
    nullable: true,
  })
  seasonId?: number;

  @Column({
    nullable: true,
  })
  episodeId?: number;

  @Column({
    nullable: true,
  })
  seasonNum?: number;

  @Column({
    nullable: true,
  })
  episodeNum?: number;

  @Column()
  runtime: number;

  @Column()
  mediaSlug: string;

  @Column()
  title: string;

  @Column({
    type: 'varchar',
    unique: true,
  })
  uuid: string;

  @Column()
  pubDate: Date;

  @Column('bigint')
  size: number;

  @Column('text')
  url: string;

  @Column()
  urlType: string;

  @Column()
  tracker: string;

  @Column()
  seeders: number;

  @Column()
  peers: number;

  @Column('smallint')
  quality: VideoQuality;

  @Column('varchar')
  codec: VideoCodec;

  @Column('varchar')
  source: VideoSource;

  @Column({
    type: 'boolean',
    default: false,
  })
  processed = false;

  @Column({
    type: 'boolean',
    default: false,
  })
  rejected = false;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

export type TorrentCreationAttributes = PartialKeys<
  Omit<Torrent, 'id' | 'createdAt' | 'updatedAt'>,
  'rejected' | 'processed'
>;
