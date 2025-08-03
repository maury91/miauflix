import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';

import { Movie } from './movie.entity';
import { User } from './user.entity';

/**
 * Streaming key entity for temporary access to movie sources
 */
@Entity()
export class StreamingKey {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    unique: true,
    length: 60, // Standard bcrypt hash length
  })
  keyHash: string;

  @ManyToOne(() => Movie, { onDelete: 'CASCADE' })
  movie: Relation<Movie>;

  @Column()
  movieId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: Relation<User>;

  @Column()
  userId: string;

  @Column({ type: 'datetime' })
  expiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
