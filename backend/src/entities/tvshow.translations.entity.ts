import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  Unique,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  type Relation,
} from "typeorm";
import { TVShow } from "./tvshow.entity";

@Entity()
export class TVShowTranslation {
  @PrimaryGeneratedColumn()
  id: number;

  @Unique(["tvShow", "language"])
  @ManyToOne(() => TVShow, (tvShow) => tvShow.translations)
  tvShow: Relation<TVShow>;

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
