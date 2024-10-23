import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Torrent } from '../database/entities/torrent.entity';
import { VideoQuality } from '@miauflix/types';
import { Movie } from '../database/entities/movie.entity';
import { MovieProcessorService } from '../movies/movies.processor.service';
import { getMovieTorrents } from '../flow/flow';

@Injectable()
export class TorrentData {
  constructor(
    private readonly movieProcessorService: MovieProcessorService,
    @InjectModel(Movie) private readonly movieModel: typeof Movie,
    @InjectModel(Torrent) private readonly torrentModel: typeof Torrent
  ) {}

  async getTorrentByMovieAndQuality(slug: string, quality: VideoQuality) {
    const {
      movie: { runtime },
      torrents,
    } = await getMovieTorrents({
      movieModel: this.movieModel,
      slug,
      getMovieExtendedData: this.movieProcessorService.getMovieExtendedData,
    });

    const torrentsOfSearchedQuality = torrents[quality];

    if (torrentsOfSearchedQuality && torrentsOfSearchedQuality.length > 0) {
      return {
        torrentFile: torrentsOfSearchedQuality[0].data,
        runtime,
      };
    }
    throw new Error('No torrent found for this movie + quality');
  }
}
