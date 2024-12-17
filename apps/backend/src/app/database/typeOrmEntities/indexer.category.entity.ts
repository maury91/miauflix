import { Column, CreateDateColumn, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Indexer } from './indexer.entity';

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

  @OneToMany(() => Indexer, (indexer) => indexer.categories)
  indexer: Indexer;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date
}
