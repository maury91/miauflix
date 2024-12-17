import { Column, CreateDateColumn, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Show } from './show.entity';
import { Episode } from './episode.entity';

@Entity()
export class Season {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Show, (show) => show.seasons)
  show: Show;

  @OneToMany(() => Episode, (episode) => episode.season)
  episodes: Episode[];

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

  @Column()
  tvdbId: number;

  @Column()
  tmdbId: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date
}
