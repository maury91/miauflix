import {
  Column,
  DataType,
  HasMany,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';
import { IndexerCategory } from './indexer.category.entity';

export interface IndexerAttributes {
  id: string;
  configured: boolean;
  title: string;
  description: string;
  language: string;
  isPrivate: boolean;
  defaultLimit: number;
  maxLimit: number;
  searchAvailable: boolean;
  searchSupportedParams: string[];
  tvSearchAvailable: boolean;
  tvSearchSupportedParams: string[];
  movieSearchAvailable: boolean;
  movieSearchSupportedParams: string[];
}

@Table
export class Indexer extends Model<IndexerAttributes> {
  @PrimaryKey
  id!: string;

  @Column
  configured!: boolean;

  @Column
  title!: string;

  @Column
  description!: string;

  @Column
  language!: string;

  @Column
  isPrivate!: boolean;

  @Column
  defaultLimit!: number;

  @Column
  maxLimit!: number;

  @Column
  searchAvailable!: boolean;

  @Column(DataType.ARRAY(DataType.STRING))
  searchSupportedParams!: string[];

  @Column
  tvSearchAvailable!: boolean;

  @Column(DataType.ARRAY(DataType.STRING))
  tvSearchSupportedParams!: string[];

  @Column
  movieSearchAvailable!: boolean;

  @Column(DataType.ARRAY(DataType.STRING))
  movieSearchSupportedParams!: string[];

  @Column(DataType.ARRAY(DataType.INTEGER.UNSIGNED))
  tvCategories!: number[];

  @Column(DataType.ARRAY(DataType.INTEGER.UNSIGNED))
  movieCategories!: number[];

  @Column(DataType.ARRAY(DataType.INTEGER.UNSIGNED))
  animeCategories!: number[];

  @HasMany(() => IndexerCategory)
  categories: IndexerCategory[];
}
