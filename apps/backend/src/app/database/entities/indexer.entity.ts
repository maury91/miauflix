import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { IndexerCategory } from './indexer.category.entity';
import { PartialKeys } from '../../../helper.types';

@Entity()
export class Indexer {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  configured: boolean;

  @Column()
  title: string;

  @Column()
  description: string;

  @Column()
  language: string;

  @Column()
  isPrivate: boolean;

  @Column()
  defaultLimit: number;

  @Column()
  maxLimit: number;

  @Column()
  searchAvailable: boolean;

  @Column({
    type: 'varchar',
    array: true,
  })
  searchSupportedParams: string[];

  @Column()
  tvSearchAvailable: boolean;

  @Column({
    type: 'varchar',
    array: true
  })
  tvSearchSupportedParams: string[];

  @Column()
  movieSearchAvailable: boolean;

  @Column({
    type: 'varchar',
    array: true
  })
  movieSearchSupportedParams: string[];

  @Column({
    type: 'smallint',
    unsigned: true,
    array: true
  })
  tvCategories: number[];

  @Column({
    type: 'smallint',
    unsigned: true,
    array: true
  })
  movieCategories: number[];

  @Column({
    type: 'smallint',
    unsigned: true,
    array: true
  })
  animeCategories: number[];

  @OneToMany(() => IndexerCategory, (category) => category.indexer)
  categories: IndexerCategory[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date
}

export type IndexerCreationAttributes = PartialKeys< Omit<Indexer, 'id' | 'categories'>, 'createdAt' | 'updatedAt'>;
