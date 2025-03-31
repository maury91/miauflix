import { TMDBApi } from "../tmdb/tmdb.api";
import { Database } from "../../database/database";
import { Movie } from "@entities/movie.entity";
import { MovieMediaSummary } from "@services/tmdb/tmdb.types";
import { MovieRepository } from "@repositories/movie.repository";
import { TVShowRepository } from "@repositories/tvshow.repository";

export class MediaService {
  private readonly tmdbApi = new TMDBApi();
  private readonly movieRepository: MovieRepository;
  private readonly tvShowRepository: TVShowRepository;

  constructor(private readonly db: Database) {
    this.movieRepository = db.getMovieRepository();
    this.tvShowRepository = db.getTVShowRepository();
  }

  public async getMovie(
    movieId: number | string,
    movieSummary?: MovieMediaSummary,
  ): Promise<Movie> {
    // Check if the movie is available in the local DB
    let movie = await this.movieRepository.findByTMDBId(Number(movieId));
    if (!movie) {
      // If not, fetch from TMDB and save it to the local DB
      const movieDetails = await this.tmdbApi.getMovieDetails(movieId);
      const runtime =
        movieDetails.runtime ??
        movieDetails.translations.find(
          (translation) => translation.data.runtime > 0,
        )?.data.runtime ??
        0;

      movie = await this.movieRepository.create({
        imdbId: movieDetails.imdb_id,
        tmdbId: movieDetails.id,
        title: movieDetails.title,
        overview: movieDetails.overview,
        tagline: movieDetails.tagline ?? "",
        releaseDate: movieDetails.release_date,
        poster: movieDetails.poster_path,
        backdrop: movieDetails.backdrop_path,
        logo: movieDetails.logo_path,
        genres: movieDetails.genres.map((genre) => genre.name),
        runtime,
        popularity: movieDetails.popularity,
        rating: movieDetails.vote_average,
      });

      await Promise.all(
        movieDetails.translations.map((translation) => {
          if (movie) {
            return this.movieRepository.addTranslation(movie, {
              title: translation.data.title,
              overview: translation.data.overview,
              tagline: translation.data.tagline,
              language: translation.iso_639_1,
            });
          }
        }),
      );
    }
    if (movieSummary) {
      await this.movieRepository.checkForChangesAndUpdate(movie, {
        tmdbId: movieSummary.id,
        title: movieSummary.title,
        overview: movieSummary.overview,
        releaseDate: movieSummary.release_date,
        poster: movieSummary.poster_path,
        backdrop: movieSummary.backdrop_path,
        genres: movieSummary.genres,
        popularity: movieSummary.popularity,
      });
    }
    return movie;
  }

  public async getTVShow(showId: number) {
    // Check if the TV show is available in the local DB
    let show = await this.tvShowRepository.findByTMDBId(showId);
    if (!show) {
      // If not, fetch from TMDB and save it to the local DB
      const showDetails = await this.tmdbApi.getTVShowDetails(showId);
      show = await this.tvShowRepository.create({
        imdbId: showDetails.external_ids.imdb_id || "",
        tmdbId: showDetails.id,
        name: showDetails.name,
        overview: showDetails.overview,
        poster: showDetails.poster_path,
        backdrop: showDetails.backdrop_path,
        status: showDetails.status,
        tagline: showDetails.tagline,
        type: showDetails.type,
        inProduction: showDetails.in_production,
        genres: showDetails.genres.map((genre) => genre.name),
        firstAirDate: showDetails.first_air_date,
        episodeRunTime: showDetails.episode_run_time,
      });

      await Promise.all(
        showDetails.translations.map(async (translation) => {
          if (show) {
            this.tvShowRepository.addTranslation(show, {
              name: translation.data.name,
              overview: translation.data.overview,
              tagline: translation.data.tagline,
              language: translation.iso_639_1,
            });
          }
        }),
      );
    }
    return show;
  }

  public async sync() {
    // FixMe: Obtain info of when was the last sync, instead of a fix date
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    // Get all changed movie and TV show IDs from TMDB
    const changedMovieIds = await this.tmdbApi.getAllChangedMovieIds(yesterday);
    const changedTVShowIds =
      await this.tmdbApi.getAllChangedTVShowIds(yesterday);

    // Update the local DB with the changed movies
    for (const movie of changedMovieIds) {
      const existingMovie = await this.movieRepository.findByTMDBId(movie.id);
      if (existingMovie) {
        const movieDetails = await this.tmdbApi.getMovieDetails(movie.id);
        await this.movieRepository.checkForChangesAndUpdate(existingMovie, {
          title: movieDetails.title,
          overview: movieDetails.overview,
          releaseDate: movieDetails.release_date,
          poster: movieDetails.poster_path,
          backdrop: movieDetails.backdrop_path,
          genres: movieDetails.genres.map((genre: any) => genre.name),
        });

        await Promise.all(
          movieDetails.translations.map((translation) => {
            return this.movieRepository.addTranslation(existingMovie, {
              title: translation.data.title,
              overview: translation.data.overview,
              tagline: translation.data.tagline,
              language: translation.iso_639_1,
            });
          }),
        );
      }
    }

    // Update the local DB with the changed TV shows
    for (const show of changedTVShowIds) {
      const existingShow = await this.tvShowRepository.findByTMDBId(show.id);
      if (existingShow) {
        const showDetails = await this.tmdbApi.getTVShowDetails(show.id);
        await this.tvShowRepository.checkForChangesAndUpdate(existingShow, {
          name: showDetails.name,
          overview: showDetails.overview,
          firstAirDate: showDetails.first_air_date,
          poster: showDetails.poster_path,
          backdrop: showDetails.backdrop_path,
          status: showDetails.status,
          tagline: showDetails.tagline,
          type: showDetails.type,
          inProduction: showDetails.in_production,
          episodeRunTime: showDetails.episode_run_time,
          imdbId: showDetails.external_ids.imdb_id || "",
          genres: showDetails.genres.map((genre) => genre.name),
        });

        await Promise.all(
          showDetails.translations.map(async (translation) => {
            this.tvShowRepository.addTranslation(existingShow, {
              name: translation.data.name,
              overview: translation.data.overview,
              tagline: translation.data.tagline,
              language: translation.iso_639_1,
            });
          }),
        );
      }
    }
  }
}
