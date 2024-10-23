import { Optional } from 'sequelize';
import {
  Table,
  Column,
  Model,
  CreatedAt,
  DataType,
  ForeignKey,
} from 'sequelize-typescript';
import { User } from './user.entity';

export interface AccessTokenAttributes {
  id: number;
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  refreshToken: string;
  deviceCode?: string;
  scope: string;
  createdAt: Date;
  userId: number;
}

export type AccessTokenCreationAttributes = Optional<
  AccessTokenAttributes,
  'id' | 'createdAt'
>;

@Table
export class AccessToken extends Model<
  AccessTokenAttributes,
  AccessTokenCreationAttributes
> {
  @Column
  accessToken!: string;

  @Column
  refreshToken!: string;

  @Column
  deviceCode?: string;

  @Column(DataType.STRING(20))
  tokenType!: string;

  @Column(DataType.STRING(20))
  scope!: string;

  @Column
  expiresIn!: number;

  @ForeignKey(() => User)
  @Column
  userId: number;

  @CreatedAt
  @Column
  override createdAt!: Date;
}
