import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  AccessToken,
  AccessTokenCreationAttributes,
} from './accessToken.entity';
import { EpisodeProgress } from './episode.progress.entity';
import { MovieProgress } from './movie.progress.entity';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({
    unique: true,
  })
  slug: string;

  @OneToMany(() => AccessToken, (accessToken) => accessToken.user, {
    cascade: ['insert'],
  })
  accessTokens: AccessToken[];

  @OneToMany(() => EpisodeProgress, (episodeProgress) => episodeProgress.user)
  episodeProgress: EpisodeProgress[];

  @OneToMany(() => MovieProgress, (movieProgress) => movieProgress.user)
  movieProgress: MovieProgress[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

export type UserCreationAttributes = Omit<
  User,
  | 'id'
  | 'createdAt'
  | 'updatedAt'
  | 'accessTokens'
  | 'episodeProgress'
  | 'movieProgress'
> & {
  accessTokens: Omit<AccessTokenCreationAttributes, 'userId'>[];
};
