import { Column, Entity, Index, JoinTable, ManyToMany, PrimaryGeneratedColumn } from 'typeorm';

import { Movie } from './movie.entity';
import { Season } from './season.entity';
import { TVShow } from './tvshow.entity';

@Entity()
export class MediaList {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({
    unique: true,
  })
  slug: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ default: 'tmdb' })
  provider: string;

  @Column({ type: 'varchar', nullable: true })
  activeGeneration: string | null;

  @Column({ type: 'datetime', nullable: true })
  lastSyncedAt: Date | null;

  @ManyToMany(() => Movie)
  @JoinTable()
  movies: Movie[];

  @ManyToMany(() => TVShow)
  @JoinTable()
  tvShows: TVShow[];

  @ManyToMany(() => Season)
  @JoinTable()
  seasons: Season[];
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

  /** Catalog media id (column name kept for existing databases). */
  @Column({ name: 'tmdbId' })
  mediaId: number;
}
