import { Column, CreateDateColumn, Entity, OneToMany, PrimaryColumn, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import {
  AccessToken, AccessTokenCreationAttributes
} from './accessToken.entity';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name!: string;

  @PrimaryColumn()
  slug!: string;

  @OneToMany(() => AccessToken, (accessToken) => accessToken.user, {
    cascade: ['insert'],
  })
  accessTokens: AccessToken[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date
}

export type UserCreationAttributes = Omit<User, 'id' | 'createdAt' | 'updatedAt' | 'accessTokens'> & {
  accessTokens: Omit<AccessTokenCreationAttributes, 'userId'>[];
};
