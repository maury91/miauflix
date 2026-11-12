import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';

import type { AvatarLook } from '@mytypes/avatar.types';

import { RefreshToken } from './refresh-token.entity';

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  passwordHash: string;

  @Column({
    type: 'varchar',
    enum: UserRole,
    default: UserRole.USER,
  })
  role: UserRole;

  @Column({ default: false })
  isEmailVerified: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  displayName: string | null;

  /** The profile's Plushie look (see `AvatarLook`); null until the profile is customized. */
  @Column({ type: 'simple-json', nullable: true })
  avatar: AvatarLook | null;

  /** When the pre-rendered avatar image was last saved; null when there is none. */
  @Column({ type: 'datetime', nullable: true })
  avatarRenderedAt: Date | null;

  @OneToMany(() => RefreshToken, refreshToken => refreshToken.user)
  refreshTokens: Relation<RefreshToken>[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
