import {
  BelongsTo,
  Column,
  DataType,
  HasMany,
  Model,
  Table,
} from 'sequelize-typescript';
import { Indexer } from './indexer.entity';

@Table
export class IndexerCategory extends Model {
  @Column
  name: string;

  @Column(DataType.INTEGER.UNSIGNED)
  catId: number;

  @HasMany(() => IndexerCategory)
  subCategories: IndexerCategory[];

  @BelongsTo(() => IndexerCategory)
  parentCategory?: IndexerCategory;

  @BelongsTo(() => Indexer)
  indexer?: Indexer;
}
