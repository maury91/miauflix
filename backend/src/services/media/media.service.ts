import { logger } from '@logger';

import type { Genre } from '@entities/genre.entity';
import type { Movie } from '@entities/movie.entity';
import type { Season } from '@entities/season.entity';
import type { TVShow, TVShowTranslation } from '@entities/tvshow.entity';
import type { Database } from '@database/database';
import type { GenreRepository } from '@repositories/genre.repository';
import type { MovieRepository } from '@repositories/movie.repository';
import type { SyncStateRepository } from '@repositories/syncState.repository';
import type { TVShowRepository } from '@repositories/tvshow.repository';
import type { TMDBApi } from '@services/tmdb/tmdb.api';
import type { MovieMediaSummary, TVShowMediaSummary } from '@services/tmdb/tmdb.types';
import { sleep } from '@utils/time';

import type { GenreWithLanguages, TranslatedMedia } from './media.types';

// ToDo: Move to configuration
const supportedLanguages = ['en'];
const MOVIE_SYNC_NAME = 'TMDB_Movies';
const TV_SYNC_NAME = 'TMDB_TVShows';

const oneHourMs = 1 * 60 * 60 * 1000;

export class MediaService {
  private readonly movieRepository: MovieRepository;
  private readonly tvShowRepository: TVShowRepository;
  private readonly genreRepository: GenreRepository;
  private readonly syncStateRepository: SyncStateRepository;
  private genreCache = new Map<number, GenreWithLanguages>();

  constructor(
    private readonly db: Database,
    private readonly tmdbApi: TMDBApi,
    private readonly defaultLanguage: string = 'en'
  ) {
    this.movieRepository = db.getMovieRepository();
    this.tvShowRepository = db.getTVShowRepository();
    this.genreRepository = db.getGenreRepository();
    this.syncStateRepository = db.getSyncStateRepository();
  }

  public async getMovie(
    movieId: number | string,
    movieSummary?: MovieMediaSummary
  ): Promise<Movie | null> {
    // Check if the movie is available in the local DB
    let movie = await this.movieRepository.findByTMDBId(Number(movieId));
    if (!movie) {
      try {
        // If not, fetch from TMDB and save it to the local DB
        const { translations, ...movieDetails } = await this.getMovieDetails(movieId);
        movie = await this.movieRepository.create(movieDetails);

        await Promise.all(
          translations.map(translation => {
            if (movie) {
              return this.movieRepository.addTranslation(movie, {
                title: translation.data.title,
                overview: translation.data.overview,
                tagline: translation.data.tagline,
                language: translation.iso_639_1,
              });
            }
          })
        );
      } catch {
        // If TMDB returns 404 or any error, return null
        return null;
      }
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

      const movieGenreIds = movie.genres.map(genre => genre.id).sort();
      const sortedGenres = genres.map(genre => genre.id).sort();

      if (movieGenreIds.toString() !== sortedGenres.toString()) {
        await this.movieRepository.updateGenres(movie, genres);
      }
    }
    return movie;
  }

  private async updateMovie(movie: Movie) {
    const { translations, ...movieDetails } = await this.getMovieDetails(movie.tmdbId);
    await this.movieRepository.checkForChangesAndUpdate(movie, movieDetails);
    await Promise.all(
      translations.map(translation => {
        return this.movieRepository.addTranslation(movie, {
          title: translation.data.title,
          overview: translation.data.overview,
          tagline: translation.data.tagline,
          language: translation.iso_639_1,
        });
      })
    );
  }

  private async getMovieDetails(movieId: number | string) {
    const movieDetails = await this.tmdbApi.getMovieDetails(movieId);
    const runtime =
      movieDetails.runtime ??
      movieDetails.translations.find(translation => translation.data.runtime > 0)?.data.runtime ??
      0;
    const genresIds = movieDetails.genres.map(genre => genre.id);
    const genres = await this.getGenres(genresIds);

    return {
      imdbId: movieDetails.imdb_id,
      tmdbId: movieDetails.id,
      title: movieDetails.title,
      overview: movieDetails.overview,
      tagline: movieDetails.tagline ?? '',
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

  public async getTVShow(showId: number, tvShowSummary?: TVShowMediaSummary): Promise<TVShow> {
    // Check if the TV show is available in the local DB
    let show = await this.tvShowRepository.findByTMDBId(showId);
    if (!show) {
      // If not, fetch from TMDB and save it to the local DB
      const showDetails = await this.tmdbApi.getTVShowDetails(showId);
      const genresIds = showDetails.genres.map(genre => genre.id);
      const genres = await this.getGenres(genresIds);

      show = await this.tvShowRepository.create({
        imdbId: showDetails.external_ids.imdb_id || '',
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
        popularity: showDetails.popularity,
        rating: showDetails.vote_average,
      });

      const dbTranslations = (
        await Promise.all(
          showDetails.translations.map(async translation => {
            if (show) {
              return this.tvShowRepository.addTranslation(show, {
                name: translation.data.name,
                overview: translation.data.overview,
                tagline: translation.data.tagline,
                language: translation.iso_639_1,
              });
            }
          })
        )
      ).filter((translation): translation is TVShowTranslation => !!translation);
      show.translations = dbTranslations;

      // Obtain all episodes and seasons
      const dbSeasons = (
        await Promise.all(
          showDetails.seasons.map(async season => {
            if (show) {
              // Create the season first
              const createdSeason = await this.tvShowRepository.createSeason(show, {
                tmdbId: season.id,
                name: season.name,
                overview: season.overview,
                airDate: season.air_date,
                posterPath: season.poster_path,
                seasonNumber: season.season_number,
              });

              return createdSeason;
            }
          })
        )
      ).filter((season): season is Season => !!season);
      show.seasons = dbSeasons;
    }

    if (tvShowSummary) {
      const genres = await this.getGenres(tvShowSummary.genres);

      await this.tvShowRepository.checkForChangesAndUpdate(show, {
        tmdbId: tvShowSummary.id,
        name: tvShowSummary.name,
        overview: tvShowSummary.overview,
        poster: tvShowSummary.poster_path,
        backdrop: tvShowSummary.backdrop_path,
        firstAirDate: tvShowSummary.first_air_date,
        popularity: tvShowSummary.popularity,
        rating: tvShowSummary.vote_average,
      });

      if (show.genres.map(genre => genre.id).toString() !== genres.toString()) {
        await this.tvShowRepository.updateGenres(show, genres);
      }
    }

    return show;
  }

  public async syncIncompleteSeasons() {
    const incompleteSeason = await this.tvShowRepository.findIncompleteSeason();
    if (incompleteSeason) {
      const seasonDetails = await this.tmdbApi.getSeason(
        incompleteSeason.tvShow.tmdbId,
        incompleteSeason.seasonNumber
      );

      // Then create all episodes for this season
      await Promise.all(
        seasonDetails.episodes.map(async episode => {
          return this.tvShowRepository.createEpisode(incompleteSeason, {
            tmdbId: episode.id,
            name: episode.name,
            overview: episode.overview,
            episodeNumber: episode.episode_number,
            airDate: episode.air_date,
            stillPath: episode.still_path,
            seasonId: incompleteSeason.id,
            imdbId: '', // We'll add this later once we sync more episode info
          });
        })
      );

      await this.tvShowRepository.markSeasonAsSynced(incompleteSeason);
    }
  }

  public async syncMovies() {
    const lastMovieSync = await this.syncStateRepository.getLastSync(MOVIE_SYNC_NAME);
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000); // Fallback if no sync state
    const movieSyncStartDate = lastMovieSync || yesterday;

    // Note: TMDB API doesn't support passing time, but only dates,
    // so our increments cannot be smaller than 1 day.

    if (now.getTime() - movieSyncStartDate.getTime() < oneHourMs) {
      logger.debug('MovieSync', 'Last sync was less than 1 hour ago. Skipping sync.');
      return;
    }

    // TMDB doesn't support more than 14 days in the past
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    if (movieSyncStartDate.getTime() < fourteenDaysAgo.getTime()) {
      logger.debug('MovieSync', 'Last sync was more than 14 days ago. Resetting to 14 days ago.');
      movieSyncStartDate.setTime(fourteenDaysAgo.getTime());
    }

    // Set the start date to the beginning of the day
    movieSyncStartDate.setHours(0);
    movieSyncStartDate.setMinutes(0);
    movieSyncStartDate.setSeconds(0);

    const chunks: Date[] = [];
    let chunk = new Date(movieSyncStartDate.getTime());
    while (chunk.getTime() < now.getTime()) {
      chunks.push(new Date(chunk));
      chunk.setDate(chunk.getDate() + 1);
    }

    let chunkIndex = 1;
    for (const chunkStart of chunks) {
      // Chunk starts at 00:00:00, chunk ends at 23:59:59 ( or now if it's the last chunk )
      const chunkEnd = chunkIndex < chunks.length ? new Date(chunkStart) : now;
      if (chunkIndex < chunks.length) {
        chunkEnd.setDate(chunkEnd.getDate() + 1);
        chunkEnd.setSeconds(-1);
      }
      const changedMovieIdsGenerator = this.tmdbApi.getAllChangedMovieIds(chunkStart, chunkEnd);

      for await (const pageResult of changedMovieIdsGenerator) {
        logger.debug(
          'MovieSync',
          `Chunk ${chunkIndex}/${chunks.length} - Processing page ${pageResult.page}/${pageResult.totalPages}`
        );
        const changedMoviesIds = pageResult.items;
        const existingMoviesInDB: Movie[] = (
          await Promise.all(
            changedMoviesIds.map(change => this.movieRepository.findByTMDBId(change.id))
          )
        ).filter((movie): movie is Movie => movie !== null);

        for (const movie of existingMoviesInDB) {
          try {
            await this.updateMovie(movie);
          } catch (error) {
            logger.error('MovieSync', `Error updating movie with TMDB ID ${movie.tmdbId}:`, error);
          }
        }
        await sleep(1000);
      }
      // If it isn't the last chunk
      if (chunkIndex < chunks.length) {
        // We want to set the last sync to the beginning of the next chunk, so we add 1 second
        chunkEnd.setSeconds(60);
      }
      await this.syncStateRepository.setLastSync(MOVIE_SYNC_NAME, chunkEnd);
      chunkIndex++;
    }
  }

  public async mediasWithLanguage(
    medias: (Movie | TVShow)[],
    language: string
  ): Promise<TranslatedMedia[]> {
    const ids = [...new Set<number>(medias.flatMap(media => media.genres.map(genre => genre.id)))];
    const genres = await this.getGenres(ids, [language]);
    const genreMap = genres.reduce(
      (acc, genre) => {
        const translation = genre.translations.find(
          translation => translation.language === language
        );
        if (translation) {
          acc[genre.id] = translation.name;
        } else {
          const defaultTranslation = genre.translations.find(
            translation => translation.language === this.defaultLanguage
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
      {} as Record<number, string>
    );

    return medias.map(media => {
      if (media instanceof this.db.Movie) {
        const { genres, translations, ...movie } = media;
        const translation = translations.find(translation => translation.language === language);
        const translatedGenres = genres.map(genre => genreMap[genre.id]);
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
      const translation = translations.find(translation => translation.language === language);
      const translatedGenres = genres.map(genre => genreMap[genre.id]);
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

  private async getGenres(ids: number[], additionalLanguages: string[] = []): Promise<Genre[]> {
    await this.ensureGenres(ids, additionalLanguages);

    return ids.map(id => {
      const genre = this.genreCache.get(id);
      if (genre) {
        return genre;
      }
      throw new Error(`Genre with id ${id} not found`);
    });
  }

  private async ensureGenres(ids: number[], additionalLanguages: string[] = []): Promise<boolean> {
    const languages = [...supportedLanguages, ...additionalLanguages];
    const incompleteLanguagesBeforeCacheRefresh = languages.filter(language =>
      ids.some(id => !this.genreCache.get(id)?.languages.includes(language))
    );

    if (incompleteLanguagesBeforeCacheRefresh.length === 0) {
      return false;
    }

    const allGenres = await this.genreRepository.findAll();
    for (const genre of allGenres) {
      this.genreCache.set(genre.id, {
        ...genre,
        languages: genre.translations.map(translation => translation.language),
      });
    }

    const incompleteLanguagesAfterCacheRefresh = languages.filter(language =>
      ids.some(id => !this.genreCache.get(id)?.languages.includes(language))
    );

    // Update the genres for all the incomplete languages
    for (const language of incompleteLanguagesAfterCacheRefresh) {
      const [movieGenres, tvShowGenres] = await Promise.all([
        this.tmdbApi.getMovieGenres(language),
        this.tmdbApi.getTVShowGenres(language),
      ]);
      for (const apiGenre of [...movieGenres.genres, ...tvShowGenres.genres]) {
        if (apiGenre.name) {
          const genre = await this.genreRepository.createOrGetGenre(apiGenre.id);
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
            languages: translations.map(translation => translation.language),
          });
          await this.genreRepository.createTranslation(genre, apiGenre.name, language);
        }
      }
    }

    return true;
  }

  private async updateTVShow(tvShow: TVShow): Promise<void> {
    const showDetails = await this.tmdbApi.getTVShowDetails(tvShow.tmdbId);

    // Update main TV show details
    await this.tvShowRepository.checkForChangesAndUpdate(tvShow, {
      imdbId: showDetails.external_ids.imdb_id || '',
      name: showDetails.name,
      overview: showDetails.overview,
      poster: showDetails.poster_path,
      backdrop: showDetails.backdrop_path,
      status: showDetails.status,
      tagline: showDetails.tagline,
      type: showDetails.type,
      inProduction: showDetails.in_production,
      firstAirDate: showDetails.first_air_date,
      episodeRunTime: showDetails.episode_run_time,
      popularity: showDetails.popularity,
      rating: showDetails.vote_average,
    });

    // Update translations
    await Promise.all(
      showDetails.translations.map(translation => {
        return this.tvShowRepository.addTranslation(tvShow, {
          name: translation.data.name,
          overview: translation.data.overview,
          tagline: translation.data.tagline,
          language: translation.iso_639_1,
        });
      })
    );

    // Update genres
    const genresIds = showDetails.genres.map(genre => genre.id);
    const genres = await this.getGenres(genresIds);
    if (tvShow.genres.map(genre => genre.id).toString() !== genres.toString()) {
      await this.tvShowRepository.updateGenres(tvShow, genres);
    }
  }

  private async updateSeason(season: Season): Promise<void> {
    const seasonDetails = await this.tmdbApi.getSeason(season.tvShow.tmdbId, season.seasonNumber);

    // Update season data if needed
    await this.tvShowRepository.updateSeasonDetails(season, {
      name: seasonDetails.name,
      overview: seasonDetails.overview,
      airDate: seasonDetails.air_date,
      posterPath: seasonDetails.poster_path,
    });

    // Update or create episodes
    await Promise.all(
      seasonDetails.episodes.map(async episode => {
        return this.tvShowRepository.createEpisode(season, {
          tmdbId: episode.id,
          name: episode.name,
          overview: episode.overview,
          episodeNumber: episode.episode_number,
          airDate: episode.air_date,
          stillPath: episode.still_path,
          seasonId: season.id,
          imdbId: '', // We'll add this later once we sync more episode info
        });
      })
    );

    await this.tvShowRepository.markSeasonAsSynced(season);
  }

  public async syncTVShows(): Promise<void> {
    const lastTVShowSync = await this.syncStateRepository.getLastSync(TV_SYNC_NAME);
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000); // Fallback if no sync state
    const tvShowSyncStartDate = lastTVShowSync || yesterday;

    // Note: TMDB API doesn't support passing time, but only dates,
    // so our increments cannot be smaller than 1 day.

    if (now.getTime() - tvShowSyncStartDate.getTime() < oneHourMs) {
      logger.debug('TVShowSync', 'Last sync was less than 1 hour ago. Skipping sync.');
      return;
    }

    // TMDB doesn't support more than 14 days in the past
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    if (tvShowSyncStartDate.getTime() < fourteenDaysAgo.getTime()) {
      logger.debug('TVShowSync', 'Last sync was more than 14 days ago. Resetting to 14 days ago.');
      tvShowSyncStartDate.setTime(fourteenDaysAgo.getTime());
    }

    // Set the start date to the beginning of the day
    tvShowSyncStartDate.setHours(0);
    tvShowSyncStartDate.setMinutes(0);
    tvShowSyncStartDate.setSeconds(0);

    const chunks: Date[] = [];
    let chunk = new Date(tvShowSyncStartDate.getTime());
    while (chunk.getTime() < now.getTime()) {
      chunks.push(new Date(chunk));
      chunk.setDate(chunk.getDate() + 1);
    }

    let chunkIndex = 1;
    for (const chunkStart of chunks) {
      // Chunk starts at 00:00:00, chunk ends at 23:59:59 (or now if it's the last chunk)
      const chunkEnd = chunkIndex < chunks.length ? new Date(chunkStart) : now;
      if (chunkIndex < chunks.length) {
        chunkEnd.setDate(chunkEnd.getDate() + 1);
        chunkEnd.setSeconds(-1);
      }

      // Get all TV show IDs that have changed in this time period
      const changedTVShowIds = await this.tmdbApi.getAllChangedTVShowIds(chunkStart, chunkEnd);

      logger.debug(
        'TVShowSync',
        `Chunk ${chunkIndex}/${chunks.length} - Processing ${changedTVShowIds.length} changed TV shows`
      );

      // Find the TV shows that exist in our DB
      const existingTVShowsInDB: TVShow[] = (
        await Promise.all(
          changedTVShowIds.map(change => this.tvShowRepository.findByTMDBId(change.id))
        )
      ).filter((tvShow): tvShow is TVShow => tvShow !== null);

      // Process each TV show
      for (const tvShow of existingTVShowsInDB) {
        try {
          // First update the main TV show data
          await this.updateTVShow(tvShow);

          // Then check for specific changes to seasons
          const tvShowChanges = await this.tmdbApi.getTVShowChanges(tvShow.tmdbId);

          // Look for season changes
          const seasonChanges = tvShowChanges.changes.filter(change => change.key === 'season');

          if (seasonChanges.length > 0) {
            for (const seasonChange of seasonChanges) {
              for (const item of seasonChange.items) {
                if (item.value && typeof item.value.season_number === 'number') {
                  // Find this season in our database
                  const season = tvShow.seasons.find(
                    s => s.seasonNumber === item.value!.season_number
                  );

                  if (season) {
                    // Mark as not synced so we'll update it in the next syncIncompleteSeasons call
                    await this.tvShowRepository.updateSeasonSyncStatus(season, false);
                  } else {
                    // This is a new season, add it to the database
                    const seasonNumber = item.value.season_number;

                    // Get season details from TMDB
                    const seasonDetails = await this.tmdbApi.getSeason(tvShow.tmdbId, seasonNumber);

                    // Create the new season
                    await this.tvShowRepository.createSeason(tvShow, {
                      tmdbId: seasonDetails.id,
                      name: seasonDetails.name,
                      overview: seasonDetails.overview,
                      airDate: seasonDetails.air_date,
                      posterPath: seasonDetails.poster_path,
                      seasonNumber: seasonNumber,
                    });
                  }
                }
              }
            }
          }
        } catch (error) {
          logger.error(
            'TVShowSync',
            `Error updating TV show with TMDB ID ${tvShow.tmdbId}:`,
            error
          );
        }
        await sleep(1000); // Rate limiting
      }

      // If it isn't the last chunk
      if (chunkIndex < chunks.length) {
        // We want to set the last sync to the beginning of the next chunk, so we add 1 second
        chunkEnd.setSeconds(60);
      }
      await this.syncStateRepository.setLastSync(TV_SYNC_NAME, chunkEnd);
      chunkIndex++;
    }
  }
}
