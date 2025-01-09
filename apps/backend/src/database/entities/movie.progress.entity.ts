import { Movie } from './movie.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PartialKeys } from '../../helper.types';
import { User } from './user.entity';

@Entity()
@Index(['movieId', 'userId'], { unique: true })
export class MovieProgress {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Movie, (movie) => movie.progress)
  @JoinColumn({ name: 'movieId', referencedColumnName: 'id' })
  movie: Movie;

  @Column()
  movieId: number;

  @ManyToOne(() => User, (user) => user.movieProgress)
  @JoinColumn({ name: 'userId', referencedColumnName: 'id' })
  user: User;

  @Column()
  userId: number;

  @Column({
    type: 'int', // maximum movie length is 68 years
    default: 0,
  })
  progress = 0;

  @Column({
    type: 'boolean',
    default: false,
  })
  synced = false;

  @Column({
    type: 'enum',
    enum: ['watching', 'stopped', 'paused'],
    default: 'stopped',
  })
  status: 'watching' | 'stopped' | 'paused' = 'stopped';

  @Column()
  slug: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

export type MovieProgressCreationAttributes = PartialKeys<
  Omit<MovieProgress, 'id' | 'movie' | 'user'>,
  'createdAt' | 'updatedAt' | 'progress' | 'synced'
>;
