import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Movie } from './movie.entity';
import { VideoSource } from '../../jackett/jackett.types';
import { VideoCodec, VideoQuality } from '@miauflix/types';

@Entity()
export class MovieSource {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  movieSlug: string;

  @ManyToOne(() => Movie, (movie) => movie.sources)
  movie: Movie;

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

  @Column('blob')
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
  updatedAt: Date
}
