import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

import { encryptedText } from '@utils/encrypted-column.util';

import { Storage } from './storage.entity';

/** Why a file of a stored source is wanted. */
export type ClaimKind = 'playback' | 'prefetch' | 'warmup' | 'watched' | 'watchlist';

/** WebTorrent piece priority requested by each claim kind. */
export const CLAIM_PRIORITY: Record<ClaimKind, number> = {
  playback: 10,
  prefetch: 1,
  watched: 1,
  warmup: 1,
  watchlist: 0,
};

/**
 * Eviction protection, lowest first: storage whose strongest live claim ranks at or below an
 * admission's limit may be evicted for it. Playback is never evictable.
 */
export const CLAIM_RANK: Record<ClaimKind, number> = {
  warmup: 1,
  watchlist: 2,
  watched: 3,
  prefetch: 4,
  playback: 5,
};

/** Claims that only prepare content nobody has asked to watch yet. */
export const SPECULATIVE_CLAIMS: readonly ClaimKind[] = ['prefetch', 'warmup', 'watchlist'];

/**
 * A request, by one owner, for one file of a stored source. Live claims decide which files are
 * downloaded and which storage may be evicted; a file stays wanted while any claim on it is live.
 */
@Entity('storage_file_claim')
@Unique(['storageId', 'path', 'kind', 'ownerKey'])
@Index(['storageId'])
@Index(['expiresAt'])
export class StorageFileClaim {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Storage, { onDelete: 'CASCADE' })
  storage: Relation<Storage>;

  @Column()
  storageId: number;

  @Column({ type: 'text', name: 'k', transformer: encryptedText({ deterministic: true }) })
  path: string;

  @Column({ length: 16 })
  kind: ClaimKind;

  @Column({ length: 128 })
  ownerKey: string;

  /** Range claims (warmup) want bytes [rangeStart, rangeEnd) of the file. */
  @Column({ type: 'integer', default: 0 })
  rangeStart: number;

  /** End of a range claim; null wants the whole file. */
  @Column({ type: 'integer', nullable: true })
  rangeEnd: number | null;

  @Column({ type: 'datetime', nullable: true })
  expiresAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
