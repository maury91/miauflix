import { Column, Entity, ManyToOne, PrimaryGeneratedColumn, type Relation, Unique } from 'typeorm';

import { Storage } from './storage.entity';

/** One file of a stored source, with its own completion state. */
@Entity('storage_file')
@Unique(['storageId', 'path'])
export class StorageFile {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Storage, { onDelete: 'CASCADE' })
  storage: Relation<Storage>;

  @Column()
  storageId: number;

  @Column('text')
  path: string;

  @Column('integer')
  offset: number;

  @Column('integer')
  length: number;

  /** Set once every piece overlapping the file is verified. */
  @Column({ type: 'datetime', nullable: true })
  completedAt: Date | null;
}
