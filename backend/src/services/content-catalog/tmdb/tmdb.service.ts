import { logger } from '@logger';

import { ENV } from '@constants';
import type { Database } from '@database/database';
import type { Genre } from '@entities/genre.entity';
import type { Movie } from '@entities/movie.entity';
import type { Season } from '@entities/season.entity';
import type { TVShow } from '@entities/tvshow.entity';
import { MediaError } from '@errors/media.errors';
import type { ScheduleTask } from '@mytypes/scheduler.types';
import type { GenreRepository } from '@repositories/genre.repository';
import type { MovieRepository } from '@repositories/movie.repository';
import type { SyncStateRepository } from '@repositories/syncState.repository';
import type { TVShowRepository } from '@repositories/tvshow.repository';
import type { TMDBApi } from '@services/content-catalog/tmdb/tmdb.api';
import type {
  MediaSummaryList,
  MovieMediaSummary,
  TVShowMediaSummary,
} from '@services/content-catalog/tmdb/tmdb.types';
import type { GenreWithLanguages } from '@services/media/media.types';
import { sleep } from '@utils/time';
import { traced } from '@utils/tracing.util';

import { movieSummaryToMovie, tvShowSummaryToTVShow } from './tmdb.transform';
import type { TranslatedMovie, TranslatedTVShow } from './tmdb.types';

const supportedLanguages = ['en'];
const MOVIE_SYNC_NAME = 'TMDB_Movies';
const TV_SYNC_NAME = 'TMDB_TVShows';
const oneHourMs = 1 * 60 * 60 * 1000;

const buildLocalizedGenreNameMap = (
  genres: Genre[],
  language: string,
  defaultLanguage: string
): Record<number, string> => {
  return genres.reduce(
    (acc, genre) => {
      const translation = genre.translations.find(translation => translation.language === language);
      if (translation) {
        acc[genre.id] = translation.name;
      } else {
        const defaultTranslation = genre.translations.find(
          translation => translation.language === defaultLanguage
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
};

export class TmdbService {
  private readonly movieRepository: MovieRepository;
  private readonly tvShowRepository: TVShowRepository;
  private readonly genreRepository: GenreRepository;
  private readonly syncStateRepository: SyncStateRepository;
  private genreCache = new Map<number, GenreWithLanguages>();

  constructor(
    db: Database,
    private readonly tmdbApi: TMDBApi,
    private readonly defaultLanguage: string = 'en'
  ) {
    this.movieRepository = db.getMovieRepository();
    this.tvShowRepository = db.getTVShowRepository();
    this.genreRepository = db.getGenreRepository();
    this.syncStateRepository = db.getSyncStateRepository();
  }

  /**
   * Gets the movie from the repository or fetches it from TMDB if it doesn't exist.
   * Updates the movie in the database if the movie summary is provided and the movie was not fetched from TMDB.
   * @param tmdbId - The TMDB ID of the movie
   * @param movieSummary - The movie summary from TMDB
   * @returns The movie or null if the movie was not found
   */
  @traced('TmdbService')
  public async getMovieByTmdbId(
    tmdbId: number | string,
    movieSummary?: MovieMediaSummary
  ): Promise<Movie | null> {
    const [movie, wasFetched] = await this.getMovieFromRepoOrFetchIt(Number(tmdbId));
    if (!movie) {
      return null;
    }
    // Movie summary may contain updated data, let's use it to update the movie in the database
    // however, if the movie was fetched from the repository, we don't need to update it
    if (movieSummary && !wasFetched) {
      await Promise.all([
        this.movieRepository.checkForChangesAndUpdate(movie, movieSummaryToMovie(movieSummary)),
        (async () => {
          const genres = await this.getGenres(movieSummary.genres);
          await this.movieRepository.checkForChangesAndUpdateGenres(movie, genres);
        })(),
      ]);
    }
    return movie;
  }

  /**
   * Gets the movie in the given language from the repository or fetches it from TMDB if it doesn't exist.
   * @param tmdbId - The TMDB ID of the movie
   * @param language - The language of the movie
   * @returns The movie in the given language or null if the movie was not found
   */
  @traced('TmdbService')
  public async getMovieInLanguage(
    tmdbId: number | string,
    language: string
  ): Promise<TranslatedMovie | null> {
    // 1. Get the movie from the repository or fetch it from TMDB
    const movie = await this.getMovieByTmdbId(tmdbId);
    if (!movie) {
      return null;
    }
    // 2. Get the genres for the movie
    const ids = [...new Set<number>(movie.genres?.map(genre => genre.id) ?? [])];
    const localizedGenreNameById = buildLocalizedGenreNameMap(
      await this.getGenres(ids, [language]),
      language,
      this.defaultLanguage
    );

    // 3. Flatten the translations and genres into one single language
    const { genres = [], translations, ...movieDetails } = movie;
    const translation = translations?.find(translation => translation.language === language);
    const translatedGenres = genres.map(genre => localizedGenreNameById[genre.id]);
    if (translation) {
      return {
        ...movieDetails,
        genres: translatedGenres,
        // A movie comes with the original title, if we found a translation for the language we want
        // we use the translation title, otherwise we use the original title
        title: translation.title || movieDetails.title,
        overview: translation.overview || movieDetails.overview,
        tagline: translation.tagline || movieDetails.tagline,
      };
    }
    return {
      ...movieDetails,
      genres: translatedGenres,
    };
  }

  /**
   * Gets the TV show from the repository or fetches it from TMDB if it doesn't exist.
   * Updates the TV show in the database if the TV show summary is provided and the TV show was not fetched from TMDB.
   * @param tmdbId - The TMDB ID of the TV show
   * @param tvShowSummary - The TV show summary from TMDB
   * @returns The TV show or null if the TV show was not found
   */
  @traced('TmdbService')
  public async getTVShowByTmdbId(
    showTmdbId: number | string,
    tvShowSummary?: TVShowMediaSummary
  ): Promise<TVShow | null> {
    const [show, wasFetched] = await this.getTVShowFromRepoOrFetchIt(Number(showTmdbId));
    if (!show) {
      return null;
    }

    // TV show summary may contain updated data, let's use it to update the TV show in the database
    // however, if the TV show was fetched from the repository, we don't need to update it
    if (tvShowSummary && !wasFetched) {
      await Promise.all([
        this.tvShowRepository.checkForChangesAndUpdate(show, tvShowSummaryToTVShow(tvShowSummary)),
        (async () => {
          const genres = await this.getGenres(tvShowSummary.genres);
          await this.tvShowRepository.checkForChangesAndUpdateGenres(show, genres);
        })(),
      ]);
    }

    return show;
  }

  /**
   * Gets the TV show in the given language from the repository or fetches it from TMDB if it doesn't exist.
   * @param tmdbId - The TMDB ID of the TV show
   * @param language - The language of the TV show
   * @returns The TV show in the given language or null if the TV show was not found
   */
  @traced('TmdbService')
  public async getTVShowInLanguage(
    tmdbId: number | string,
    language: string
  ): Promise<TranslatedTVShow | null> {
    // 1. Get the TV show from the repository or fetch it from TMDB
    const tvShow = await this.getTVShowByTmdbId(tmdbId);
    if (!tvShow) {
      return null;
    }
    // 2. Get the genres for the TV show
    const ids = [...new Set<number>(tvShow.genres?.map(genre => genre.id) ?? [])];
    const localizedGenreNameById = buildLocalizedGenreNameMap(
      await this.getGenres(ids, [language]),
      language,
      this.defaultLanguage
    );

    // 3. Flatten the translations and genres into one single language
    const { genres = [], translations, ...tvShowDetails } = tvShow;
    const translation = translations?.find(translation => translation.language === language);
    const translatedGenres = genres.map(genre => localizedGenreNameById[genre.id]);

    if (translation) {
      return {
        ...tvShowDetails,
        genres: translatedGenres,
        // A TV show comes with the original name, if we found a translation for the language we want
        // we use the translation name, otherwise we use the original name
        name: translation.name || tvShowDetails.name,
        overview: translation.overview || tvShowDetails.overview,
        tagline: translation.tagline || tvShowDetails.tagline,
      };
    }
    return {
      ...tvShowDetails,
      genres: translatedGenres,
    };
  }

  /**
   * Gets the season from the repository or fetches it from TMDB if it doesn't exist.
   * @param tvShowTmdbId - The TMDB ID of the TV show
   * @param seasonNumber - The season number
   * @returns The season or null if the season was not found
   */
  @traced('TmdbService')
  public async getSeason(tvShowTmdbId: number, seasonNumber: number): Promise<Season | null> {
    const show = await this.tvShowRepository.findByTMDBId(tvShowTmdbId);
    if (!show) {
      return null;
    }
    const existingSeason = show.seasons?.find(s => s.seasonNumber === seasonNumber);
    if (existingSeason) {
      return existingSeason;
    }
    const seasonDetails = await this.tmdbApi.getSeason(tvShowTmdbId, seasonNumber);
    const createdSeason = await this.tvShowRepository.createSeason(
      show,
      {
        tmdbId: seasonDetails.id,
        name: seasonDetails.name,
        overview: seasonDetails.overview,
        airDate: seasonDetails.air_date,
        posterPath: seasonDetails.poster_path,
        seasonNumber: seasonDetails.season_number,
      },
      {
        episodes: seasonDetails.episodes.map(episode => ({
          tmdbId: episode.id,
          name: episode.name,
          overview: episode.overview,
          episodeNumber: episode.episode_number,
          airDate: episode.air_date,
          stillPath: episode.still_path,
          imdbId: '',
        })),
      }
    );
    await this.tvShowRepository.markSeasonAsSynced(createdSeason);
    return createdSeason;
  }

  /**
   * Gets the list content from TMDB API for the given slug and page.
   * @param slug - The slug of the list
   * @param page - The page number
   * @returns The list content from TMDB API
   */
  @traced('TmdbService')
  public async getListSource(slug: string, page: number): Promise<MediaSummaryList> {
    switch (slug) {
      case '@@tmdb_movies_popular':
        return this.tmdbApi.getPopularMovies(page);
      case '@@tmdb_movies_top-rated':
        return this.tmdbApi.getTopRatedMovies(page);
      case '@@tmdb_shows_popular':
        return this.tmdbApi.getPopularShows(page);
      default:
        throw new MediaError(`List with slug ${slug} not found`, 'list_not_found');
    }
  }

  /** Used by MediaService for mediasWithLanguage and by TmdbService internally. */
  public async getGenres(ids: number[], additionalLanguages: string[] = []): Promise<Genre[]> {
    try {
      await this.ensureGenres(ids, additionalLanguages);
    } catch (error) {
      logger.error(
        'TmdbService',
        'Error ensuring genres:',
        error,
        error instanceof Error ? error.stack : undefined
      );
      throw new MediaError('Failed to ensure genres', 'genres_failed');
    }

    return ids.map(id => {
      const genre = this.genreCache.get(id);
      if (genre) {
        return genre;
      }
      throw new MediaError(`Genre with id ${id} not found`, 'genre_not_found');
    });
  }

  @traced('TmdbService')
  public async sync(): Promise<void> {
    await this.syncMovies();
    await this.syncTVShows();
    await this.syncIncompleteSeasons();
  }

  /**
   * Gets the movie from the repository or fetches it from TMDB if it doesn't exist.
   * @param tmdbId - The TMDB ID of the movie
   * @returns [Movie | null, boolean] - The movie from the repository or the new movie if it was created, and a boolean indicating if the movie was fetched from TMDB
   */
  private async getMovieFromRepoOrFetchIt(tmdbId: number): Promise<[Movie | null, boolean]> {
    const movie = await this.movieRepository.findByTMDBId(tmdbId);
    if (movie) {
      return [movie, false];
    }
    try {
      // 1. Fetch movie details from TMDB
      const { translations, ...movieDetails } = await this.getMovieDetails(tmdbId);

      // 2. Create movie in database
      const newMovie = await this.movieRepository.create(movieDetails, {
        translations: translations.map(t => ({
          title: t.data.title,
          overview: t.data.overview,
          tagline: t.data.tagline,
          language: t.iso_639_1,
        })),
      });

      return [newMovie, true];
    } catch (err) {
      logger.error(
        'TmdbService',
        `Error fetching movie with TMDB ID ${tmdbId}:`,
        err,
        err instanceof Error ? err.stack : undefined
      );
      return [null, false];
    }
  }

  /**
   * Gets the TV show from the repository or fetches it from TMDB if it doesn't exist.
   * @param tmdbId - The TMDB ID of the TV show
   * @returns [TVShow | null, boolean] - The TV show from the repository or the new TV show if it was created, and a boolean indicating if the TV show was fetched from TMDB
   */
  private async getTVShowFromRepoOrFetchIt(tmdbId: number): Promise<[TVShow | null, boolean]> {
    const tvShow = await this.tvShowRepository.findByTMDBId(tmdbId);
    if (tvShow) {
      return [tvShow, false];
    }
    try {
      // 1. Fetch TV show details from TMDB
      const { translations, seasons, ...tvShowDetails } = await this.getTVShowDetails(tmdbId);

      // 2. Create TV show in database (with translations and seasons)
      const newTVShow = await this.tvShowRepository.create(tvShowDetails, {
        translations: translations.map(t => ({
          name: t.data.name,
          overview: t.data.overview,
          tagline: t.data.tagline,
          language: t.iso_639_1,
        })),
        seasons: seasons.map(s => ({
          tmdbId: s.id,
          name: s.name,
          overview: s.overview,
          airDate: s.air_date,
          posterPath: s.poster_path,
          seasonNumber: s.season_number,
        })),
      });

      return [newTVShow, true];
    } catch (err) {
      logger.error(
        'TmdbService',
        `Error fetching TV show with TMDB ID ${tmdbId}:`,
        err,
        err instanceof Error ? err.stack : undefined
      );
      return [null, false];
    }
  }

  /**
   * Gets the movie details from TMDB.
   * @param movieTmdbId - The TMDB ID of the movie
   * @returns The movie details
   */
  private async getMovieDetails(movieTmdbId: number | string) {
    const movieDetails = await this.tmdbApi.getMovieDetails(movieTmdbId);
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

  /**
   * Gets the TV show details from TMDB, including seasons.
   * @param showTmdbId - The TMDB ID of the TV show
   * @returns The TV show details
   */
  private async getTVShowDetails(showTmdbId: number) {
    const showDetails = await this.tmdbApi.getTVShowDetails(showTmdbId);
    const genresIds = showDetails.genres.map(genre => genre.id);
    const genres = await this.getGenres(genresIds);

    return {
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
      translations: showDetails.translations,
      seasons: showDetails.seasons,
    };
  }

  private async updateMovie(movie: Movie): Promise<void> {
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

  private async ensureGenres(ids: number[], additionalLanguages: string[] = []): Promise<boolean> {
    logger.debug('TmdbService', `Ensuring genres for IDs: ${ids.join(', ')}`);
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
    const {
      translations,
      seasons,
      genres: newGenres,
      ...updatePayload
    } = await this.getTVShowDetails(tvShow.tmdbId);
    void seasons; // not used in update; only in create path

    await this.tvShowRepository.checkForChangesAndUpdate(tvShow, updatePayload);

    await Promise.all(
      translations.map(translation => {
        return this.tvShowRepository.addTranslation(tvShow, {
          name: translation.data.name,
          overview: translation.data.overview,
          tagline: translation.data.tagline,
          language: translation.iso_639_1,
        });
      })
    );

    const oldGenresIds =
      tvShow.genres
        ?.map(genre => genre.id)
        .sort()
        .toString() ?? '';
    if (
      oldGenresIds !==
      newGenres
        .map(g => g.id)
        .sort()
        .toString()
    ) {
      await this.tvShowRepository.updateGenres(tvShow, newGenres);
    }
  }

  private async updateSeason(season: Season): Promise<void> {
    const seasonDetails = await this.tmdbApi.getSeason(season.tvShow.tmdbId, season.seasonNumber);

    await this.tvShowRepository.updateSeasonDetails(season, {
      name: seasonDetails.name,
      overview: seasonDetails.overview,
      airDate: seasonDetails.air_date,
      posterPath: seasonDetails.poster_path,
    });

    await Promise.all(
      seasonDetails.episodes.map(episode =>
        this.tvShowRepository.createEpisode(season, {
          tmdbId: episode.id,
          name: episode.name,
          overview: episode.overview,
          episodeNumber: episode.episode_number,
          airDate: episode.air_date,
          stillPath: episode.still_path,
          seasonId: season.id,
          imdbId: '',
        })
      )
    );

    await this.tvShowRepository.markSeasonAsSynced(season);
  }

  private async getWatchingTVShowIds(): Promise<number[]> {
    return await this.tvShowRepository.getWatchingTVShowIds();
  }

  @traced('TmdbService')
  public async syncIncompleteSeasons(): Promise<void> {
    const episodeSyncMode = ENV('EPISODE_SYNC_MODE');

    const incompleteSeasons =
      episodeSyncMode === 'GREEDY'
        ? await this.tvShowRepository.findIncompleteSeasons()
        : await this.tvShowRepository.findIncompleteSeasonsByShowIds(
            await this.getWatchingTVShowIds()
          );

    if (!incompleteSeasons?.length) {
      return;
    }

    const incompleteSeason = incompleteSeasons[0];
    const seasonDetails = await this.tmdbApi.getSeason(
      incompleteSeason.tvShow.tmdbId,
      incompleteSeason.seasonNumber
    );

    await Promise.all(
      seasonDetails.episodes.map(episode =>
        this.tvShowRepository.createEpisode(incompleteSeason, {
          tmdbId: episode.id,
          name: episode.name,
          overview: episode.overview,
          episodeNumber: episode.episode_number,
          airDate: episode.air_date,
          stillPath: episode.still_path,
          seasonId: incompleteSeason.id,
          imdbId: '',
        })
      )
    );

    await this.tvShowRepository.markSeasonAsSynced(incompleteSeason);
  }

  @traced('TmdbService')
  public async syncMovies(): Promise<void> {
    const lastMovieSync = await this.syncStateRepository.getLastSync(MOVIE_SYNC_NAME);
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const movieSyncStartDate = lastMovieSync || yesterday;

    if (now.getTime() - movieSyncStartDate.getTime() < oneHourMs) {
      logger.debug('TmdbService', 'Last movie sync was less than 1 hour ago. Skipping.');
      return;
    }

    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    if (movieSyncStartDate.getTime() < fourteenDaysAgo.getTime()) {
      movieSyncStartDate.setTime(fourteenDaysAgo.getTime());
    }

    movieSyncStartDate.setUTCHours(0);
    movieSyncStartDate.setUTCMinutes(0);
    movieSyncStartDate.setUTCSeconds(0);

    const chunks: Date[] = [];
    const chunk = new Date(movieSyncStartDate.getTime());
    while (chunk.getTime() < now.getTime()) {
      chunks.push(new Date(chunk));
      chunk.setUTCDate(chunk.getUTCDate() + 1);
    }

    let chunkIndex = 1;
    for (const chunkStart of chunks) {
      const chunkEnd = chunkIndex < chunks.length ? new Date(chunkStart) : now;
      if (chunkIndex < chunks.length) {
        chunkEnd.setUTCDate(chunkEnd.getUTCDate() + 1);
        chunkEnd.setUTCSeconds(-1);
      }

      const changedMovieIdsGenerator = this.tmdbApi.getAllChangedMovieIds(chunkStart, chunkEnd);

      for await (const pageResult of changedMovieIdsGenerator) {
        logger.debug(
          'TmdbService',
          `Movie sync chunk ${chunkIndex}/${chunks.length} - page ${pageResult.page}/${pageResult.totalPages}`
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
            logger.error('TmdbService', `Error updating movie TMDB ID ${movie.tmdbId}:`, error);
          }
        }
        await sleep(1000);
      }

      if (chunkIndex < chunks.length) {
        chunkEnd.setSeconds(60);
      }
      await this.syncStateRepository.setLastSync(MOVIE_SYNC_NAME, chunkEnd);
      chunkIndex++;
    }
  }

  @traced('TmdbService')
  public async syncTVShows(): Promise<void> {
    const lastTVShowSync = await this.syncStateRepository.getLastSync(TV_SYNC_NAME);
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const tvShowSyncStartDate = lastTVShowSync || yesterday;

    if (now.getTime() - tvShowSyncStartDate.getTime() < oneHourMs) {
      logger.debug('TmdbService', 'Last TV show sync was less than 1 hour ago. Skipping.');
      return;
    }

    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    if (tvShowSyncStartDate.getTime() < fourteenDaysAgo.getTime()) {
      tvShowSyncStartDate.setTime(fourteenDaysAgo.getTime());
    }

    tvShowSyncStartDate.setHours(0);
    tvShowSyncStartDate.setMinutes(0);
    tvShowSyncStartDate.setSeconds(0);

    const chunks: Date[] = [];
    const chunk = new Date(tvShowSyncStartDate.getTime());
    while (chunk.getTime() < now.getTime()) {
      chunks.push(new Date(chunk));
      chunk.setDate(chunk.getDate() + 1);
    }

    let chunkIndex = 1;
    for (const chunkStart of chunks) {
      const chunkEnd = chunkIndex < chunks.length ? new Date(chunkStart) : now;
      if (chunkIndex < chunks.length) {
        chunkEnd.setDate(chunkEnd.getDate() + 1);
        chunkEnd.setSeconds(-1);
      }

      const changedTVShowIds = await this.tmdbApi.getAllChangedTVShowIds(chunkStart, chunkEnd);

      logger.debug(
        'TmdbService',
        `TV show sync chunk ${chunkIndex}/${chunks.length} - ${changedTVShowIds.length} changed shows`
      );

      const existingTVShowsInDB: TVShow[] = (
        await Promise.all(
          changedTVShowIds.map(change => this.tvShowRepository.findByTMDBId(change.id))
        )
      ).filter((tvShow): tvShow is TVShow => tvShow !== null);

      for (const tvShow of existingTVShowsInDB) {
        try {
          await this.updateTVShow(tvShow);

          const tvShowChanges = await this.tmdbApi.getTVShowChanges(tvShow.tmdbId);
          const seasonChanges = tvShowChanges.changes.filter(change => change.key === 'season');

          if (seasonChanges.length > 0) {
            const createdSeasonNumbers = new Set<number>();
            for (const seasonChange of seasonChanges) {
              for (const item of seasonChange.items) {
                if (item.value && typeof item.value.season_number === 'number') {
                  const seasonNumber = item.value.season_number;
                  const season = tvShow.seasons?.find(s => s.seasonNumber === seasonNumber);

                  if (season) {
                    await this.tvShowRepository.updateSeasonSyncStatus(season, false);
                  } else if (!createdSeasonNumbers.has(seasonNumber)) {
                    const seasonDetails = await this.tmdbApi.getSeason(tvShow.tmdbId, seasonNumber);
                    await this.tvShowRepository.createSeason(tvShow, {
                      tmdbId: seasonDetails.id,
                      name: seasonDetails.name,
                      overview: seasonDetails.overview,
                      airDate: seasonDetails.air_date,
                      posterPath: seasonDetails.poster_path,
                      seasonNumber: seasonNumber,
                    });
                    createdSeasonNumbers.add(seasonNumber);
                  }
                }
              }
            }
          }
        } catch (error) {
          logger.error('TmdbService', `Error updating TV show TMDB ID ${tvShow.tmdbId}:`, error);
        }
        await sleep(1000);
      }

      if (chunkIndex < chunks.length) {
        chunkEnd.setSeconds(60);
      }
      await this.syncStateRepository.setLastSync(TV_SYNC_NAME, chunkEnd);
      chunkIndex++;
    }
  }

  public getSyncTasks(): ScheduleTask[] {
    return [
      {
        name: 'syncMovies',
        interval: 1.5 * 60 * 60, // 1.5 hour
        task: this.syncMovies.bind(this),
      },
      {
        name: 'syncTVShows',
        interval: 1.5 * 60 * 60, // 1.5 hour
        task: this.syncTVShows.bind(this),
      },
      {
        name: 'syncIncompleteSeasons',
        interval: 1, // 1 second
        task: this.syncIncompleteSeasons.bind(this),
      },
    ];
  }
}
