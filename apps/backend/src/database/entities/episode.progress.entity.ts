import { Episode } from './episode.entity';
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
@Index(['episodeId', 'userId'], { unique: true })
export class EpisodeProgress {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Episode, (episode) => episode.progress)
  @JoinColumn({ name: 'episodeId', referencedColumnName: 'id' })
  episode: Episode;

  @Column()
  episodeId: number;

  @ManyToOne(() => User, (user) => user.episodeProgress)
  @JoinColumn({ name: 'userId', referencedColumnName: 'id' })
  user: User;

  @Column()
  userId: number;

  @Column({
    type: 'smallint', // maximum episode length is 9 hours
    default: 0,
  })
  progress = 0;

  @Column({
    type: 'boolean',
    default: false,
  })
  synced = false;

  @Column('int')
  traktId: number;

  @Column({
    type: 'enum',
    enum: ['watching', 'stopped', 'paused'],
    default: 'stopped',
  })
  status: 'watching' | 'stopped' | 'paused' = 'stopped';

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

export type EpisodeProgressCreationAttributes = PartialKeys<
  Omit<EpisodeProgress, 'id' | 'episode' | 'user'>,
  'createdAt' | 'updatedAt' | 'progress' | 'synced'
>;
