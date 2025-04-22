import { logger } from "@logger";
import { sleep } from "bun";

import type { Genre } from "@entities/genre.entity";
import { Movie } from "@entities/movie.entity";
import type { TVShow } from "@entities/tvshow.entity";
import type { Database } from "@database/database";
import type { GenreRepository } from "@repositories/genre.repository";
import type { MovieRepository } from "@repositories/movie.repository";
import type { SyncStateRepository } from "@repositories/syncState.repository";
import type { TVShowRepository } from "@repositories/tvshow.repository";
import type { MovieMediaSummary } from "@services/tmdb/tmdb.types";

import { TMDBApi } from "../tmdb/tmdb.api";
import type { GenreWithLanguages, TranslatedMedia } from "./media.types";

// ToDo: Move to configuration
const supportedLanguages = ["en"];
const MOVIE_SYNC_NAME = "TMDB_Movies";
// const TV_SYNC_NAME = "TMDB_TVShows";

const oneHourMs = 1 * 60 * 60 * 1000;
const twoHoursMs = oneHourMs * 2;
const fourHoursMs = oneHourMs * 4;

export class MediaService {
  private readonly tmdbApi = new TMDBApi();
  private readonly movieRepository: MovieRepository;
  private readonly tvShowRepository: TVShowRepository;
  private readonly genreRepository: GenreRepository;
  private readonly syncStateRepository: SyncStateRepository;
  private genreCache = new Map<number, GenreWithLanguages>();

  constructor(
    db: Database,
    private readonly defaultLanguage: string = "en",
  ) {
    this.movieRepository = db.getMovieRepository();
    this.tvShowRepository = db.getTVShowRepository();
    this.genreRepository = db.getGenreRepository();
    this.syncStateRepository = db.getSyncStateRepository();
  }

  public async getMovie(
    movieId: number | string,
    movieSummary?: MovieMediaSummary,
  ): Promise<Movie> {
    // Check if the movie is available in the local DB
    let movie = await this.movieRepository.findByTMDBId(Number(movieId));
    if (!movie) {
      // If not, fetch from TMDB and save it to the local DB
      const { translations, ...movieDetails } =
        await this.getMovieDetails(movieId);
      movie = await this.movieRepository.create(movieDetails);

      await Promise.all(
        translations.map((translation) => {
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
      const genres = await this.getGenres(movieSummary.genres);

      await this.movieRepository.checkForChangesAndUpdate(movie, {
        tmdbId: movieSummary.id,
        title: movieSummary.title,
        overview: movieSummary.overview,
        releaseDate: movieSummary.release_date,
        poster: movieSummary.poster_path,
        backdrop: movieSummary.backdrop_path,
        popularity: movieSummary.popularity,
      });

      if (
        movie.genres.map((genre) => genre.id).toString() !== genres.toString()
      ) {
        await this.movieRepository.updateGenres(movie, genres);
      }
    }
    return movie;
  }

  private async updateMovie(movie: Movie) {
    const { translations, ...movieDetails } = await this.getMovieDetails(
      movie.tmdbId,
    );
    await this.movieRepository.checkForChangesAndUpdate(movie, movieDetails);
    await Promise.all(
      translations.map((translation) => {
        return this.movieRepository.addTranslation(movie, {
          title: translation.data.title,
          overview: translation.data.overview,
          tagline: translation.data.tagline,
          language: translation.iso_639_1,
        });
      }),
    );
  }

  private async getMovieDetails(movieId: number | string) {
    const movieDetails = await this.tmdbApi.getMovieDetails(movieId);
    const runtime =
      movieDetails.runtime ??
      movieDetails.translations.find(
        (translation) => translation.data.runtime > 0,
      )?.data.runtime ??
      0;
    const genresIds = movieDetails.genres.map((genre) => genre.id);
    const genres = await this.getGenres(genresIds);

    return {
      imdbId: movieDetails.imdb_id,
      tmdbId: movieDetails.id,
      title: movieDetails.title,
      overview: movieDetails.overview,
      tagline: movieDetails.tagline ?? "",
      releaseDate: movieDetails.release_date,
      poster: movieDetails.poster_path,
      backdrop: movieDetails.backdrop_path,
      logo: movieDetails.logo_path,
      genres,
      runtime,
      popularity: movieDetails.popularity,
      rating: movieDetails.vote_average,
      translations: movieDetails.translations,
    };
  }

  public async getTVShow(showId: number): Promise<TVShow> {
    // Check if the TV show is available in the local DB
    let show = await this.tvShowRepository.findByTMDBId(showId);
    if (!show) {
      // If not, fetch from TMDB and save it to the local DB
      const showDetails = await this.tmdbApi.getTVShowDetails(showId);
      const genresIds = showDetails.genres.map((genre) => genre.id);
      const genres = await this.getGenres(genresIds);

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
        genres,
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

  public async syncMovies() {
    const lastMovieSync =
      await this.syncStateRepository.getLastSync(MOVIE_SYNC_NAME);
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000); // Fallback if no sync state
    const movieSyncStartDate = lastMovieSync || yesterday;

    if (now.getTime() - movieSyncStartDate.getTime() < oneHourMs) {
      logger.debug(
        "MovieSync",
        "Last sync was less than 1 hour ago. Skipping sync.",
      );
      return;
    }

    let chunkStart = movieSyncStartDate;
    let chunkIndex = 1;
    const totalChunks =
      Math.floor((now.getTime() - chunkStart.getTime()) / twoHoursMs) + 1;

    while (chunkStart.getTime() < now.getTime()) {
      const chunkSize =
        now.getTime() - chunkStart.getTime() > fourHoursMs
          ? twoHoursMs
          : now.getTime() - chunkStart.getTime();
      const chunkEnd = new Date(chunkStart.getTime() + chunkSize);
      const changedMovieIdsGenerator = this.tmdbApi.getAllChangedMovieIds(
        chunkStart,
        chunkEnd,
      );

      for await (const pageResult of changedMovieIdsGenerator) {
        logger.debug(
          "MovieSync",
          `Chunk ${chunkIndex}/${totalChunks} - Processing page ${pageResult.page}/${pageResult.totalPages}`,
        );
        const changedMoviesIds = pageResult.items;
        const existingMoviesInDB: Movie[] = (
          await Promise.all(
            changedMoviesIds.map((change) =>
              this.movieRepository.findByTMDBId(change.id),
            ),
          )
        ).filter((movie): movie is Movie => movie !== null);

        for (const movie of existingMoviesInDB) {
          try {
            await this.updateMovie(movie);
          } catch (error) {
            logger.error(
              "MovieSync",
              `Error updating movie with TMDB ID ${movie.tmdbId}:`,
              error,
            );
          }
        }
        await sleep(1000);
      }
      await this.syncStateRepository.setLastSync(MOVIE_SYNC_NAME, chunkEnd);
      chunkStart = chunkEnd;
      chunkIndex++;
    }
  }

  public async mediasWithLanguage(
    medias: (Movie | TVShow)[],
    language: string,
  ): Promise<TranslatedMedia[]> {
    const ids = [
      ...new Set<number>(
        medias.flatMap((media) => media.genres.map((genre) => genre.id)),
      ),
    ];
    const genres = await this.getGenres(ids, [language]);
    const genreMap = genres.reduce(
      (acc, genre) => {
        const translation = genre.translations.find(
          (translation) => translation.language === language,
        );
        if (translation) {
          acc[genre.id] = translation.name;
        } else {
          const defaultTranslation = genre.translations.find(
            (translation) => translation.language === this.defaultLanguage,
          );
          if (defaultTranslation) {
            acc[genre.id] = defaultTranslation.name;
          } else if (genre.translations.length > 0) {
            acc[genre.id] = genre.translations[0].name;
          } else {
            acc[genre.id] = `Genre ${genre.id}`;
          }
        }
        return acc;
      },
      {} as Record<number, string>,
    );

    return medias.map((media) => {
      if (media instanceof Movie) {
        const { genres, translations, ...movie } = media;
        const translation = translations.find(
          (translation) => translation.language === language,
        );
        const translatedGenres = genres.map((genre) => genreMap[genre.id]);
        if (translation) {
          return {
            ...movie,
            genres: translatedGenres,
            title: translation.title || media.title,
            overview: translation.overview || media.overview,
            tagline: translation.tagline || media.tagline,
          };
        }
        return {
          ...movie,
          genres: translatedGenres,
        };
      }
      const { genres, translations, ...tvShow } = media;
      const translation = translations.find(
        (translation) => translation.language === language,
      );
      const translatedGenres = genres.map((genre) => genreMap[genre.id]);
      if (translation) {
        return {
          ...tvShow,
          genres: translatedGenres,
          name: translation.name || media.name,
          overview: translation.overview || media.overview,
          tagline: translation.tagline || media.tagline,
        };
      }
      return {
        ...tvShow,
        genres: translatedGenres,
      };
    });
  }

  private async getGenres(
    ids: number[],
    additionalLanguages: string[] = [],
  ): Promise<Genre[]> {
    await this.ensureGenres(ids, additionalLanguages);

    return ids.map((id) => {
      const genre = this.genreCache.get(id);
      if (genre) {
        return genre;
      }
      throw new Error(`Genre with id ${id} not found`);
    });
  }

  private async ensureGenres(
    ids: number[],
    additionalLanguages: string[] = [],
  ): Promise<boolean> {
    const languages = [...supportedLanguages, ...additionalLanguages];
    const incompleteLanguagesBeforeCacheRefresh = languages.filter((language) =>
      ids.some((id) => !this.genreCache.get(id)?.languages.includes(language)),
    );

    if (incompleteLanguagesBeforeCacheRefresh.length === 0) {
      return false;
    }

    const allGenres = await this.genreRepository.findAll();
    for (const genre of allGenres) {
      this.genreCache.set(genre.id, {
        ...genre,
        languages: genre.translations.map(
          (translation) => translation.language,
        ),
      });
    }

    const incompleteLanguagesAfterCacheRefresh = languages.filter((language) =>
      ids.some((id) => !this.genreCache.get(id)?.languages.includes(language)),
    );

    // Update the genres for all the incomplete languages
    for (const language of incompleteLanguagesAfterCacheRefresh) {
      const [movieGenres, tvShowGenres] = await Promise.all([
        this.tmdbApi.getMovieGenres(language),
        this.tmdbApi.getTVShowGenres(language),
      ]);
      for (const apiGenre of [...movieGenres.genres, ...tvShowGenres.genres]) {
        if (apiGenre.name) {
          const genre = await this.genreRepository.createOrGetGenre(
            apiGenre.id,
          );
          const cachedGenre = this.genreCache.get(genre.id) ?? {
            ...genre,
            translations: [],
            languages: [],
          };
          const translations = cachedGenre.languages.includes(language)
            ? cachedGenre.translations
            : [
                ...cachedGenre.translations,
                {
                  id: 0,
                  genre,
                  genreId: genre.id,
                  language,
                  name: apiGenre.name,
                },
              ];
          this.genreCache.set(genre.id, {
            ...cachedGenre,
            translations,
            languages: translations.map((translation) => translation.language),
          });
          await this.genreRepository.createTranslation(
            genre,
            apiGenre.name,
            language,
          );
        }
      }
    }

    return true;
  }
}
