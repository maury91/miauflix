import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
@Index(['userId', 'playableKey'])
export class PlaybackGrant {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true, length: 64 })
  keyHash: string;

  @Column()
  userId: string;

  @Column()
  sourceId: number;

  @Column({ length: 16 })
  playableKind: 'episode' | 'movie';

  @Column({ length: 128 })
  playableKey: string;

  @Column({ type: 'datetime' })
  expiresAt: Date;

  /** The grant was created for a watch-once download. */
  @Column({ default: false })
  watchOnce: boolean;

  /** How the file matched the playable: a combined file must not be deleted per episode. */
  @Column({ length: 16, default: 'single' })
  matchKind: 'combined' | 'movie' | 'single';

  @CreateDateColumn()
  createdAt: Date;
}
