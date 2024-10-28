import { VideoQuality } from '@miauflix/types';
import { Torrent } from '../database/entities/torrent.entity';
import { Op } from 'sequelize';
import { Movie } from '../database/entities/movie.entity';
import { Source } from '../database/entities/source.entity';

const groupTorrentsByQuality = (torrents: Torrent[]) => {
  return torrents.reduce<Partial<Record<VideoQuality, Torrent[]>>>(
    (acc, torrent) => {
      if (!acc[torrent.quality]) {
        acc[torrent.quality] = [];
      }
      acc[torrent.quality].push(torrent);
      return acc;
    },
    {}
  );
};

interface GetTorrentsForMovieArgs {}

export const getTorrentsForMovie = async ({}: GetTorrentsForMovieArgs) => {};

interface GetMovieTorrentsArgs {
  slug: string;
  movieModel: typeof Movie;
  optionalTorrents?: boolean;

  getMovieExtendedData(movieSlug: string): Promise<Movie>;
}

interface GetMovieTorrentsResponse {
  movie: Movie;
  sources: Source[];
}

export const getMovieTorrents = async ({
  movieModel,
  slug,

  getMovieExtendedData,
}: GetMovieTorrentsArgs): Promise<GetMovieTorrentsResponse> => {
  const movie = await movieModel.findOne({
    where: {
      slug,
    },
    include: {
      model: Source,
      as: 'allSources',
      attributes: ['data', 'quality', 'codec'],
    },
  });

  if (!movie) {
    const movie = await getMovieExtendedData(slug);
    console.log(movie);
    // throw new Error(
    //   'To be implemented: got the movie, but not the torrent yet'
    // );
  }

  return {
    movie,
    sources: movie.allSources,
  };
};
