export type VideoQuality = 2160 | 1440 | 1080 | 720 | 480 | 360;
export type VideoQualityStr = '2160' | '1440' | '1080' | '720' | '480' | '360';

export type VideoCodec =
  | 'x264'
  | 'x264 10bit'
  | 'x265'
  | 'x265 10bit'
  | 'AV1'
  | 'AV1 10bit'
  | 'XVid'
  | 'unknown';

export interface MovieImages {
  poster: string;
  backdrop: string;
  backdrops: string[];
  logos: string[];
}

export interface MovieDto {
  id: string;
  title: string;
  year: number;
  ids: {
    trakt: number;
    slug: string;
    imdb: string;
    tmdb: number;
  };
  images: MovieImages;
}

export interface ExtendedMovieDto extends MovieDto {
  overview: string;
  runtime: number;
  trailer: string;
  rating: number;
  genres: string[];
  qualities: VideoQualityStr[];
}
