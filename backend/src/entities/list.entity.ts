import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToMany,
  JoinTable,
} from "typeorm";
import { Movie } from "./movie.entity";
import { TVShow } from "./tvshow.entity";
import { Season } from "./season.entity";

@Entity()
export class MediaList {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({
    unique: true,
  })
  slug: string;

  @Column({ nullable: true })
  description?: string;

  @ManyToMany(() => Movie)
  @JoinTable()
  movies: Movie[];

  @ManyToMany(() => TVShow)
  @JoinTable()
  tvShows: TVShow[];

  @ManyToMany(() => Season)
  @JoinTable()
  seasons: Season[];
}
