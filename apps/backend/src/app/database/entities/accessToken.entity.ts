import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn } from 'typeorm'
import { User } from './user.entity';
import { PartialKeys } from '../../../helper.types';

@Entity()
export class AccessToken {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  accessToken: string;

  @Column()
  refreshToken: string;

  @Column()
  deviceCode: string;

  @Column({
    type: 'varchar',
    length: 20
  })
  tokenType: string;

  @Column({
    type: 'varchar',
    length: 20
  })
  scope: string;

  @Column()
  expiresIn: number;

  @ManyToOne(() => User, (user) => user.accessTokens)
  user: User;
  userId: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date
}

export type AccessTokenCreationAttributes = PartialKeys<Omit<AccessToken, 'id' | 'user'>, 'createdAt' | 'updatedAt'>
