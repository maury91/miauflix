import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Indexer } from './indexer.entity';
import { PartialKeys } from '../../../helper.types';

@Entity()
export class IndexerCategory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({
    type: 'int',
    unsigned: true,
  })
  catId: number;

  @OneToMany(() => IndexerCategory, (category) => category.parentCategory)
  subCategories: IndexerCategory[];

  @ManyToOne(() => IndexerCategory, (category) => category.subCategories, {
    nullable: true,
  })
  @JoinColumn({ name: 'parentCategoryId', referencedColumnName: 'id' })
  parentCategory?: IndexerCategory;
  parentCategoryId?: number;

  @ManyToOne(() => Indexer, (indexer) => indexer.categories, {
    nullable: false,
  })
  indexer: Indexer;

  @Column()
  indexerId: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

export type IndexerCategoryCreationAttributes = PartialKeys<
  Omit<IndexerCategory, 'id' | 'parentCategory' | 'indexer'>,
  'createdAt' | 'updatedAt'
>;
