import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  Unique,
  type Relation,
} from "typeorm";

@Unique(["movie", "language"])
@Entity()
export class MovieTranslation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  language: string;

  @ManyToOne(() => Movie, (movie) => movie.translations)
  movie: Relation<Movie>;

  @Column()
  movieId: number;

  @Column("text")
  overview: string;

  @Column()
  title: string;

  @Column()
  tagline: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity()
export class Movie {
  /** IDs */
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    unique: true,
  })
  tmdbId: number;

  @Column({
    unique: true,
    nullable: true,
  })
  imdbId: string | null;

  /** Metadata */

  @Column()
  title: string;

  @Column("text")
  overview: string;

  @Column()
  runtime: number;

  @Column()
  tagline: string;

  // ToDo: Obtain data
  @Column({
    type: "varchar",
    length: 500,
    nullable: true,
  })
  trailer: string;

  @Column({
    type: "decimal",
    precision: 4,
    scale: 2,
    default: 0,
  })
  rating: number;

  @Column({
    type: "float",
    default: 0,
  })
  popularity: number;

  @Column()
  releaseDate: string;

  @Column("simple-array")
  genres: string[];

  @OneToMany(() => MovieTranslation, (translation) => translation.movie, {
    cascade: true,
    eager: true,
  })
  translations: Relation<MovieTranslation>[];

  /** Images */

  @Column()
  poster: string;

  @Column()
  backdrop: string;

  @Column()
  logo: string;

  /** Time */

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
