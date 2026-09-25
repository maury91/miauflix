import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

import { User } from './user.entity';

@Entity()
@Unique(['userId', 'playableKey'])
@Index('idx_progress_user_updated', ['userId', 'updatedAt'])
export class Progress {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: Relation<User>;

  @Column()
  userId: string;

  @Column({ length: 16 })
  playableKind: 'episode' | 'movie';

  @Column({ length: 128 })
  playableKey: string;

  @Column('float')
  positionSeconds: number;

  @Column('float')
  durationSeconds: number;

  @Column({ length: 16 })
  state: 'completed' | 'paused' | 'playing';

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
