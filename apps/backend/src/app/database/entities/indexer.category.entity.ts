import { Column, CreateDateColumn, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
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
    unsigned: true
  })
  catId: number;

  @OneToMany(() => IndexerCategory, (category) => category.parentCategory)
  subCategories: IndexerCategory[];

  @ManyToOne(() => IndexerCategory, (category) => category.subCategories)
  parentCategory?: IndexerCategory;
  parentCategoryId?: number;

  @OneToMany(() => Indexer, (indexer) => indexer.categories)
  indexer: Indexer;
  indexerId: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date
}

export type IndexerCategoryCreationAttributes = PartialKeys<Omit<IndexerCategory, 'id' | 'parentCategory' | 'indexer'>, 'createdAt' | 'updatedAt'>
