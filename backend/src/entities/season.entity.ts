import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";
import { TVShow } from "./tvshow.entity";
import { Episode } from "./episode.entity";

@Entity()
export class Season {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  tmdbId: number;

  @Column()
  seasonNumber: number;

  @Column()
  name: string;

  @Column()
  overview: string;

  @Column()
  airDate: string;

  @Column()
  posterPath: string;

  @Column()
  imdbId: string;

  @OneToMany(() => Episode, (episode) => episode.season)
  episodes: (typeof Episode)[];

  @ManyToOne(() => TVShow, (tvShow) => tvShow.seasons)
  tvShow: typeof TVShow;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
