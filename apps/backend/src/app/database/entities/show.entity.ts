import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Season } from './season.entity';
import { Episode } from './episode.entity';
import { PartialKeys } from '../../../helper.types';

@Entity()
export class Show {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    unique: true,
  })
  slug: string;

  @Column()
  title: string;

  @Column()
  year: number;

  @Column('text')
  overview: string;

  @Column()
  network: string;

  @Column()
  status: string;

  @Column()
  runtime: number;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  trailer: string;

  @Column({
    type: 'decimal',
    precision: 4,
    scale: 2,
    nullable: true,
  })
  rating: number;

  @Column({
    type: 'smallint',
    default: 0,
  })
  airedEpisodes: number;

  @Column()
  traktId: number;

  @Column({
    nullable: true,
  })
  imdbId?: string;

  @Column({
    nullable: true,
  })
  tmdbId?: number;

  @Column({
    nullable: true,
  })
  tvdbId?: number;

  @Column()
  poster: string;

  @Column()
  backdrop: string;

  @Column({
    type: 'varchar',
    array: true,
  })
  backdrops: string[];

  @Column({
    type: 'varchar',
    array: true,
  })
  logos: string[];

  @Column({
    type: 'varchar',
    array: true,
  })
  genres: string[];

  @Column({
    type: 'smallint',
    unsigned: true,
    default: 0,
  })
  seasonsCount = 0;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  lastCheckedAt: Date;

  @OneToMany(() => Season, (season) => season.show)
  seasons: Season[];

  @OneToMany(() => Episode, (episode) => episode.show)
  episodes: Episode[];

  @Column({
    nullable: true,
  })
  lastSeasonAirDate?: Date;

  @Column({
    nullable: true,
  })
  lastEpisodeAirDate?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

export type ShowCreationAttributes = PartialKeys<
  Omit<Show, 'id' | 'seasons' | 'episodes'>,
  'createdAt' | 'updatedAt' | 'seasonsCount' | 'lastCheckedAt'
>;
