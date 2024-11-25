import { MediaImages } from './media';

export interface ShowDto {
  type: 'show';
  id: string;
  title: string;
  year: number;
  ids: {
    trakt: number;
    slug: string;
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
