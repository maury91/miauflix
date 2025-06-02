import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';

import { MovieSource } from './movie.entity';

@Entity('storage')
@Index('idx_storage_last_access', ['lastAccessAt'])
@Index('idx_storage_location', ['location'])
export class Storage {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => MovieSource, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'movieSourceId' })
  movieSource: Relation<MovieSource>;

  @Column()
  movieSourceId: number;

  @Column({
    type: 'blob',
    transformer: {
      to: (value: Uint8Array) => Buffer.from(value),
      from: (value: Buffer) => new Uint8Array(value),
    },
  })
  downloadedPieces: Uint8Array;

  @Column({
    type: 'integer',
  })
  size: number;

  @Column({
    type: 'integer',
    default: 0,
  })
  downloaded: number;

  @Column({
    type: 'varchar',
    length: 500,
  })
  location: string;

  @Column({
    type: 'datetime',
    nullable: true,
  })
  lastAccessAt: Date | null;

  @Column({
    type: 'datetime',
    nullable: true,
  })
  lastWriteAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
