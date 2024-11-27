import { MediaImages } from './media';

export interface ShowDto {
  type: 'show';
  id: string;
  title: string;
  year: number;
  ids: {
    imdb: string;
    tmdb: number;
    tvdb: number;
  };
  images: MediaImages;
}

export interface ExtendedShowDto extends ShowDto {
  overview: string;
  runtime: number;
  trailer: string;
  rating: number;
  genres: string[];
  airedEpisodes: number;
  network: string;
}

export interface EpisodeDto {
  number: number;
  order: number;
  title: string;
  overview: string;
  rating: number;
  firstAired: Date;
  runtime: number;
  image: string;
}

export interface SeasonDto {
  number: number;
  title: string;
  overview: string;
  episodesCount: number;
  airedEpisodes: number;
  rating: number;
  network: string;
  episodes: EpisodeDto[];
}
