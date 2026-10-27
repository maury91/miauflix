import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  Unique,
} from 'typeorm';

import { encryptedText } from '@utils/encrypted-column.util';

import { ContentSource } from './content-source.entity';
import { Movie } from './movie.entity';

/** Associates a catalog movie with a content source that contains it. */
@Entity()
@Unique(['movieId', 'sourceId'])
@Index(['movieId'])
export class MovieSource {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Movie, movie => movie.sources, { onDelete: 'CASCADE' })
  movie: Relation<Movie>;

  @Column()
  movieId: number;

  @ManyToOne(() => ContentSource, source => source.movies, { onDelete: 'CASCADE' })
  source: Relation<ContentSource>;

  @Column()
  sourceId: number;

  /** Main video inside the source; null until the source's file list is known. */
  @Column({
    type: 'text',
    nullable: true,
    name: 'k',
    transformer: encryptedText({ deterministic: true }),
  })
  videoFilePath: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
