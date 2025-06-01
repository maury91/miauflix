import { Column, Entity, JoinTable, ManyToMany, PrimaryGeneratedColumn } from 'typeorm';

import { Movie, MovieClass } from './movie.entity';
import { Season } from './season.entity';
import { TVShow } from './tvshow.entity';

export const createMediaListEntity = (Movie: MovieClass) => {
  @Entity()
  class MediaList {
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

  return MediaList;
};

export type MediaListClass = ReturnType<typeof createMediaListEntity>;
export type MediaList = InstanceType<MediaListClass>;
