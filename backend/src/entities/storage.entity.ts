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

import { MovieSource } from './movie-source.entity';

@Entity('storage')
@Index('idx_storage_last_access', ['lastAccessAt'])
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

  /** Logical bytes belong to the selected playable file, not physical usage. */
  @Column({ type: 'integer', default: 0 })
  logicalBytes: number;

  /** Bytes verified from the torrent bitfield. */
  @Column({ type: 'integer', default: 0 })
  verifiedBytes: number;

  /** Physical filesystem blocks charged to this storage. */
  @Column({ type: 'integer', default: 0 })
  allocatedBytes: number;

  /** Admission charge while physical allocation has not been measured. */
  @Column({ type: 'integer', default: 0 })
  reservedBytes: number;

  @Column({ type: 'integer', default: 0 })
  totalPieces: number;

  @Column({ type: 'integer', default: 0 })
  pieceLength: number;

  @Column({ length: 16, default: 'watched' })
  retentionClass: 'speculative' | 'watched';

  @Column({ type: 'datetime', nullable: true })
  lastInterestAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  speculativeExpiresAt: Date | null;

  @Column({ type: 'integer', default: 0 })
  activeStreams: number;

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
