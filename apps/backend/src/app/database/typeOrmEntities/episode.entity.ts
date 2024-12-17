import { Season } from './season.entity';
import { Show } from './show.entity';
import { EpisodeSource } from './episode.source.entity';
import { Column, CreateDateColumn, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class Episode {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Show, (show) => show.episodes)
  show: Show;

  @ManyToOne(() => Season, (season) => season.episodes)
  season: Season;

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

  @Column({
    type: 'boolean',
    default: false,
  })
  sourceFound!: boolean;

  @Column({
    type: 'boolean',
    default: false,
  })
  sourcesSearched: boolean;

  @Column({
    type: 'boolean',
    default: false,
  })
  noSourceFound!: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date
}
