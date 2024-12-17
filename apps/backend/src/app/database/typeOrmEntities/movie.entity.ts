import { Column, CreateDateColumn, Entity, OneToMany, PrimaryColumn, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { MovieSource } from './movie.source.entity';

@Entity()
export class Movie {
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
  runtime: number;

  @Column({
    type: 'varchar',
    length: 500,
  })
  trailer: string;

  @Column({
    type: 'decimal',
    precision: 4,
    scale: 2,
  })
  rating: number;

  @Column()
  traktId: number;

  @Column()
  imdbId: string;

  @Column()
  tmdbId: number;

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
    type: 'boolean',
    default: false,
  })
  sourcesSearched: boolean;

  @Column({
    type: 'boolean',
    default: false,
  })
  noSourceFound: boolean;

  @Column({
    type: 'boolean',
    default: false
  })
  sourceFound: boolean;

  @OneToMany(() => MovieSource, (movieSource) => movieSource.movie)
  sources: MovieSource[];

  @Column({
    type: 'varchar',
    array: true,
  })
  genres: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date
}
