import { Season } from './season.entity';
import { Show } from './show.entity';
import { EpisodeSource } from './episode.source.entity';
import { Column, CreateDateColumn, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { PartialKeys } from '../../../helper.types';

@Entity()
export class Episode {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Show, (show) => show.episodes)
  show: Show;
  showId: number;

  @ManyToOne(() => Season, (season) => season.episodes)
  season: Season;
  seasonId: number;

  @OneToMany(() => EpisodeSource, (episodeSource) => episodeSource.episode)
  sources!: EpisodeSource[];

  @Column('smallint')
  number: number;

  @Column('smallint')
  order: number;

  @Column()
  title: string;

  @Column('text')
  overview: string;

  @Column({
    type: 'decimal',
    precision: 4,
    scale: 2,
  })
  rating: number;

  @Column()
  firstAired: Date;

  @Column('smallint')
  runtime: number;

  @Column({
    type: 'varchar',
    length: 30,
  })
  episodeType!: string;

  @Column()
  image: string;

  @Column()
  traktId: number;

  @Column()
  imdbId: string;

  @Column()
  tvdbId: number;

  @Column()
  tmdbId: number;

  @Column({
    type: 'boolean',
    default: false,
  })
  sourceFound = false;

  @Column({
    type: 'boolean',
    default: false,
  })
  sourcesSearched = false;

  @Column({
    type: 'boolean',
    default: false,
  })
  noSourceFound = false;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date
}

export type EpisodeCreationAttributes = PartialKeys<Omit<Episode, 'id' | 'season' | 'show' | 'sources'>, 'createdAt' | 'updatedAt' | 'sourceFound' | 'sourcesSearched' | 'noSourceFound'>
