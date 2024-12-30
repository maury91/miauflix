import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Show } from './show.entity';
import { Episode } from './episode.entity';
import { PartialKeys } from '../../../helper.types';
import { SeasonSource } from './season.source.entity';

@Entity()
export class Season {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Show, (show) => show.seasons)
  @JoinColumn({ name: 'showId', referencedColumnName: 'id' })
  show: Show;

  @Column()
  showId: number;

  @OneToMany(() => Episode, (episode) => episode.season)
  episodes: Episode[];

  @OneToMany(() => SeasonSource, (seasonSource) => seasonSource.season)
  sources: SeasonSource[];

  @Column()
  number: number;

  @Column()
  title: string;

  @Column('text')
  overview: string;

  @Column()
  episodesCount: number;

  @Column()
  airedEpisodes: number;

  @Column({
    type: 'decimal',
    precision: 4,
    scale: 2,
  })
  rating: number;

  @Column()
  network: string;

  @Column()
  traktId: number;

  @Column({
    nullable: true,
  })
  tvdbId?: number;

  @Column({
    nullable: true,
  })
  tmdbId?: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

export type SeasonCreationAttributes = PartialKeys<
  Omit<Season, 'id' | 'episodes' | 'show' | 'sources'>,
  'createdAt' | 'updatedAt'
>;
