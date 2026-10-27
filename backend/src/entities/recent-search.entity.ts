import { Column, Entity, Index, ManyToOne, PrimaryColumn, type Relation } from 'typeorm';

import type { SearchRecentKind } from '@routes/search.types';
import { encryptedText } from '@utils/encrypted-column.util';

import { User } from './user.entity';

/** A user's recent search; repeated searches bump `searchedAt` instead of adding rows. */
@Entity('recent_searches')
@Index(['userId', 'searchedAt'])
export class RecentSearch {
  @PrimaryColumn()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: Relation<User>;

  @PrimaryColumn({ type: 'varchar' })
  kind: SearchRecentKind;

  /** Case-folded query, so "dune" and "Dune" are one entry. */
  @PrimaryColumn({
    type: 'varchar',
    name: 'k',
    transformer: encryptedText({ deterministic: true }),
  })
  queryKey: string;

  /** The query as last typed. */
  @Column({ type: 'varchar', name: 'v', transformer: encryptedText({ deterministic: false }) })
  query: string;

  @Column({ type: 'datetime' })
  searchedAt: Date;
}
