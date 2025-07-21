import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';

import { User } from './user.entity';

@Entity('trakt_users')
export class TraktUser {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User)
  @JoinColumn()
  user: Relation<User>;

  @Column({ type: 'varchar' })
  userId: string;

  @Column({ type: 'varchar', unique: true })
  traktSlug: string;

  @Column({ type: 'varchar', nullable: true })
  traktUsername: string | null;

  @Column({ type: 'varchar', nullable: true })
  accessToken: string | null;

  @Column({ type: 'varchar', nullable: true })
  refreshToken: string | null;

  @Column({ type: 'datetime', nullable: true })
  tokenExpiresAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
