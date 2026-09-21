import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
@Index(['ownerKey', 'slug'], { unique: true })
export class MediaList {
  @PrimaryGeneratedColumn()
  id: number;
  @Column()
  name: string;
  @Column()
  slug: string;
  @Column({ default: 'public' })
  ownerKey: string;
  @Column({ type: 'varchar', nullable: true })
  remoteListId: string | null;
  @Column({ nullable: true })
  description?: string;
  @Column({ default: 'trakt' })
  provider: string;
  @Column({ type: 'varchar', nullable: true })
  activeGeneration: string | null;
  @Column({ type: 'datetime', nullable: true })
  lastSyncedAt: Date | null;
}

export type MediaListItemType = 'movie' | 'tv';

@Entity()
@Index(['listId', 'generation', 'position'], { unique: true })
@Index(['listId', 'generation', 'mediaType', 'mediaId'], { unique: true })
export class MediaListItem {
  @PrimaryGeneratedColumn()
  id: number;
  @Column()
  listId: number;
  @Column()
  generation: string;
  @Column()
  position: number;
  @Column()
  mediaType: MediaListItemType;
  @Column({ name: 'tmdbId' })
  mediaId: number;
}
