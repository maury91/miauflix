import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';

import { User } from './user.entity';

@Entity('refresh_tokens')
@Index(['expiresAt'])
@Index(['userId', 'session'], { unique: true })
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 64 })
  @Index({ unique: true })
  tokenHash: string;

  /**
   * The hash this session's token had before its last rotation. Presenting that token again
   * (after `rotatedAt` plus a short grace) means it was copied: the session is revoked.
   */
  @Column({ type: 'varchar', length: 64, nullable: true })
  previousTokenHash: string | null;

  @Column({ type: 'datetime', nullable: true })
  rotatedAt: Date | null;

  @Column()
  expiresAt: Date;

  @Column()
  @Index()
  userId: string;

  @Column({ length: 64 })
  @Index()
  session: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  userAgent: string | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  lastIpAddress: string | null;

  @Column({ type: 'datetime' })
  lastAccessedAt: Date;

  @Column({ default: 1 })
  accessCount: number;

  // Token issuance information
  @Column({ type: 'varchar', length: 45, nullable: true })
  issueIpAddress: string | null;

  @ManyToOne(() => User, user => user.refreshTokens, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: Relation<User>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
