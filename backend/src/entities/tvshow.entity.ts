import {
  Column,
  CreateDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
  Unique,
  UpdateDateColumn,
} from "typeorm";

import { Genre } from "./genre.entity";
import { Season } from "./season.entity";

@Entity()
export class TVShow {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  tmdbId: number;

  @Column()
  name: string;

  @Column("text")
  overview: string;

  @Column()
  firstAirDate: string;

  @Column()
  poster: string;

  @Column()
  backdrop: string;

  @Column({ nullable: true })
  imdbId?: string;

  @Column()
  status: string;

  @Column()
  tagline: string;

  @Column()
  type: string;

  @Column()
  inProduction: boolean;

  @Column("simple-array")
  episodeRunTime: number[];

  @ManyToMany(() => Genre)
  @JoinTable()
  genres: Relation<Genre>[];

  @Column({
    type: "float",
    default: 0,
  })
  popularity: number;

  @Column({
    type: "float",
    default: 0,
  })
  rating: number;

  @OneToMany(() => Season, (season) => season.tvShow)
  seasons: Relation<Season>[];

  @OneToMany(
    () => TVShowTranslation,
    (tvShowTranslation) => tvShowTranslation.tvShow,
  )
  translations: Relation<TVShowTranslation>[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity()
@Unique(["tvShow", "language"])
export class TVShowTranslation {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => TVShow, (tvShow) => tvShow.translations)
  tvShow: Relation<TVShow>;

  @Column()
  tvShowId: number;

  @Column()
  language: string;

  @Column()
  name: string;

  @Column("text")
  overview: string;

  @Column()
  tagline: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
