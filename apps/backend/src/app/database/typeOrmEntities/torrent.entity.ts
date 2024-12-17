import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { VideoSource } from '../../jackett/jackett.types';
import { VideoCodec, VideoQuality } from '@miauflix/types';

@Entity()
export class Torrent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  movieId?: number;

  @Column()
  showId?: number;

  @Column()
  seasonId?: number;

  @Column()
  episodeId?: number;

  @Column()
  seasonNum?: number;

  @Column()
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
  processed: boolean;

  @Column({
    type: 'boolean',
    default: false,
  })
  rejected: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date
}