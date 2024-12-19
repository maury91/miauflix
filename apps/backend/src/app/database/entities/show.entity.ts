import { Column, CreateDateColumn, Entity, OneToMany, PrimaryColumn, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Season } from './season.entity';
import { Episode } from './episode.entity';
import { PartialKeys } from '../../../helper.types';

@Entity()
export class Show {
  @PrimaryGeneratedColumn()
  id: number;

  @PrimaryColumn()
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
    length: 500
  })
  trailer: string;

  @Column({
    type: 'decimal',
    precision: 4,
    scale: 2,
  })
  rating: number;

  @Column('smallint')
  airedEpisodes: number;

  @Column()
  traktId: number;

  @Column()
  imdbId: string;

  @Column()
  tmdbId: number;

  @Column()
  tvdbId: number;

  @Column()
  poster: string;

  @Column()
  backdrop: string;

  @Column({
    type: 'varchar',
    array: true
  })
  backdrops: string[];

  @Column({
    type: 'varchar',
    array: true
  })
  logos: string[];

  @Column({
    type: 'varchar',
    array: true
  })
  genres: string[];

  @Column({
    type: 'smallint',
    unsigned: true,
    default: 0
  })
  seasonsCount = 0;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP'})
  lastCheckedAt: Date;

  @OneToMany(() => Season, (season) => season.show)
  seasons: Season[];

  @OneToMany(() => Episode, (episode) => episode.show)
  episodes: Episode[];

  @Column()
  lastSeasonAirDate?: Date;

  @Column()
  lastEpisodeAirDate?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date
}

export type ShowCreationAttributes = PartialKeys<Omit<Show, 'id' | 'seasons' | 'episodes'>, 'createdAt' | 'updatedAt' | 'seasonsCount' | 'lastCheckedAt'>;
