import { VideoQuality } from '../jackett/jackett.types';
import { Torrent } from '../database/entities/torrent.entity';
import { Op } from 'sequelize';
import { Movie } from '../database/entities/movie.entity';

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
  torrents: Partial<Record<VideoQuality, Torrent[]>>;
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
      model: Torrent,
      as: 'allTorrents',
      attributes: ['data', 'quality'],
      where: {
        processed: true,
        data: {
          [Op.not]: null,
        },
      },
    },
  });

  if (!movie) {
    const movie = await getMovieExtendedData(slug);
    console.log(movie);
    throw new Error(
      'To be implemented: got the movie, but not the torrent yet'
    );
  }

  return {
    movie,
    torrents: groupTorrentsByQuality(movie.allTorrents),
  };
};
