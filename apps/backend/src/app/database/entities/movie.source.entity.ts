import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Movie } from './movie.entity';
import { VideoSource } from '../../jackett/jackett.types';
import { VideoCodec, VideoQuality } from '@miauflix/types';
import { PartialKeys } from '../../../helper.types';

@Entity()
export class MovieSource {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  movieSlug: string;

  @ManyToOne(() => Movie, (movie) => movie.sources)
  @JoinColumn({ name: 'movieId', referencedColumnName: 'id' })
  movie: Movie;

  @Column()
  movieId: number;

  @Column()
  originalSource: string;

  @Column({
    type: 'varchar',
    array: true,
    length: 500,
  })
  videos: string[];

  @Column('bigint')
  size: number;

  @Column('bytea')
  data?: Buffer;

  @Column('smallint')
  quality: VideoQuality;

  @Column('varchar')
  codec: VideoCodec;

  @Column('varchar')
  source: VideoSource;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

export type MovieSourceCreationAttributes = PartialKeys<
  Omit<MovieSource, 'id' | 'movie'>,
  'createdAt' | 'updatedAt'
>;
