import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  type Relation,
} from "typeorm";
import { Season } from "./season.entity";
import { TVShowTranslation } from "./tvshow.translations.entity";

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

  @Column("simple-array")
  genres: string[];

  @Column({
    type: "float",
    default: 0,
  })
  popularity: number;

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
