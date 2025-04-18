import {
  Column,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
  Unique,
} from "typeorm";

@Entity()
export class Genre {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToMany(
    () => GenreTranslation,
    (genreTranslation) => genreTranslation.genre,
  )
  translations: Relation<GenreTranslation[]>;
}

@Entity()
@Unique(["genreId", "language"])
export class GenreTranslation {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Genre, (genre) => genre.translations)
  genre: Relation<Genre>;

  @Column()
  genreId: number;

  @Column()
  name: string;

  @Column()
  language: string;
}
