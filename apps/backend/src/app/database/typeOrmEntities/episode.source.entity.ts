import { Episode } from './episode.entity';
import { VideoSource } from '../../jackett/jackett.types';
import { VideoCodec, VideoQuality } from '@miauflix/types';
import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class EpisodeSource {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Episode, (episode) => episode.sources)
  episode: Episode;

  @Column()
  showSlug: string;

  @Column()
  rejected: boolean;

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

  @Column('blob')
  data?: Buffer;

  @Column('smallint')
  quality!: VideoQuality;

  @Column({
    type: 'varchar',
    length: 20,
  })
  codec!: VideoCodec;

  @Column({
    type: 'varchar',
    length: 20,
  })
  source!: VideoSource;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date
}
