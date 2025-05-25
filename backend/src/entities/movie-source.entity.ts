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

import { Movie } from './movie.entity';

/**
 * Movie source entity to store information about available sources for movies
 */
@Entity()
@Unique(['movieId', 'hash']) // Avoid duplicates of the same source for a movie
export class MovieSource {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Movie, movie => movie.sources)
  movie: Relation<Movie>;

  @Column()
  movieId: number;

  @Column()
  hash: string;

  @Column()
  magnetLink: string;

  @Column()
  quality: string;

  @Column()
  resolution: number; // Vertical resolution in pixels ( used for sorting and filtering )

  @Column()
  size: number; // Size in bytes

  @Column()
  videoCodec: string; // e.g. "x264", "x265", "HVEC"

  @Column({ nullable: true })
  seeds?: number;

  @Column({ nullable: true })
  leechers?: number;

  @Column()
  source: string; // Which tracker provided this source

  @Column({
    type: 'blob',
    nullable: true,
  })
  torrentFile?: Buffer; // The actual torrent file data

  // Timestamps
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
