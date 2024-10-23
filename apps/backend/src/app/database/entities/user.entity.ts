import {
  Table,
  Column,
  Model,
  Unique,
  HasMany,
  CreatedAt,
} from 'sequelize-typescript';
import {
  AccessToken,
  AccessTokenAttributes,
  AccessTokenCreationAttributes,
} from './accessToken.entity';
import { Optional } from 'sequelize';

export interface UserAttributes {
  id: number;
  name: string;
  slug: string;
  accessTokens: AccessTokenAttributes[];
  createdAt: Date;
}

export interface UserCreationAttributes
  extends Omit<Optional<UserAttributes, 'id' | 'createdAt'>, 'accessTokens'> {
  accessTokens?: Omit<AccessTokenCreationAttributes, 'userId'>[];
}

@Table
export class User extends Model<UserAttributes, UserCreationAttributes> {
  @Column
  name!: string;

  @Unique
  @Column
  slug!: string;

  @HasMany(() => AccessToken)
  accessTokens: AccessToken;

  @CreatedAt
  @Column
  override createdAt!: Date;
}
