import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Relation,
  UpdateDateColumn,
} from 'typeorm';

import { Episode } from './episode.entity';
import { Movie } from './movie.entity';
import { User } from './user.entity';

@Entity()
export class Progress {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User)
  user: Relation<User>;

  @Column()
  userId: string;

  @Column('float')
  progress: number; // 0-100

  @Column()
  status: string; // watching, completed, paused

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity()
export class ProgressMovie extends Progress {
  @ManyToOne(() => Movie)
  movie: Relation<Movie>;

  @Column({ nullable: true })
  movieId: number;
}

@Entity()
export class ProgressEpisode extends Progress {
  @ManyToOne(() => Episode)
  episode: Relation<Episode>;

  @Column({ nullable: true })
  episodeId: number;
}
