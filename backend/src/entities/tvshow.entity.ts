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

  @OneToMany(() => Season, season => season.tvShow)
  seasons: Relation<Season>[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
