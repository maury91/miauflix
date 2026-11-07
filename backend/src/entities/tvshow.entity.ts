import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';

import { Season } from './season.entity';

/**
 * Local index of catalog tv shows — see movie.entity.ts for the rationale.
 * Seasons/episodes are mirrored too (episode playback needs them locally);
 * full details, translations and genres live in the media-catalog service.
 */
@Entity()
export class TVShow {
  @PrimaryGeneratedColumn()
  id: number;

  /** Catalog media id (column name kept for existing databases). */
  @Column({ unique: true, name: 'tmdbId' })
  mediaId: number;

  @Column()
  name: string;

  @Column('text')
  overview: string;

  @Column()
  firstAirDate: string;

  @Column()
  poster: string;

  @Column()
  backdrop: string;

  @Column({ nullable: true })
  imdbId?: string;

  @Column()
  status: string;

  /** A typical episode's length in minutes (the catalog's shortest), null when unknown. */
  @Column({ type: 'integer', nullable: true })
  episodeRuntime: number | null;

  @Column({
    type: 'float',
    default: 0,
  })
  popularity: number;

  @Column({
    type: 'float',
    default: 0,
  })
  rating: number;

  @Column({
    default: false,
  })
  watching: boolean = false;

  /**
   * The catalog's season numbering the local seasons and episodes follow: null for TMDB's own,
   * otherwise the catalog's AniList layout version. A different catalog value renumbers them.
   */
  @Column({ type: 'varchar', length: 32, nullable: true })
  seasonLayoutVersion: string | null = null;

  @OneToMany(() => Season, season => season.tvShow)
  seasons: Relation<Season>[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
