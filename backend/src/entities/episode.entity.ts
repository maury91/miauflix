import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

import { Season } from './season.entity';

@Entity()
@Unique(['seasonId', 'episodeNumber'])
export class Episode {
  @PrimaryGeneratedColumn()
  id: number;

  /** Catalog episode id (column name kept for existing databases). */
  @Column({ name: 'tmdbId' })
  mediaId: number;

  @Column()
  seasonId: number;

  @Column()
  episodeNumber: number;

  @Column()
  name: string;

  @Column()
  overview: string;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  airDate: string | null;

  @Column()
  stillPath: string;

  @Column()
  imdbId: string;

  @ManyToOne(() => Season, season => season.episodes)
  season: Relation<Season>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
