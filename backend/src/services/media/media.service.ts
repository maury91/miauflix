import type { Database } from '@database/database';
import { Movie } from '@entities/movie.entity';
import type { TVShow } from '@entities/tvshow.entity';
import type { MovieRepository } from '@repositories/movie.repository';
import type { TVShowRepository } from '@repositories/tvshow.repository';
import type { TmdbService } from '@services/content-catalog/tmdb/tmdb.service';
import type {
  MovieMediaSummary,
  TVShowMediaSummary,
} from '@services/content-catalog/tmdb/tmdb.types';
import { traced } from '@utils/tracing.util';

import type { TranslatedMedia } from './media.types';

export class MediaService {
  private readonly movieRepository: MovieRepository;
  private readonly tvShowRepository: TVShowRepository;

  constructor(
    db: Database,
    private readonly tmdbService: TmdbService,
    private readonly defaultLanguage: string = 'en'
  ) {
    this.movieRepository = db.getMovieRepository();
    this.tvShowRepository = db.getTVShowRepository();
  }

  @traced('MediaService')
  public async getMovieByTmdbId(
    tmdbId: number | string,
    movieSummary?: MovieMediaSummary
  ): Promise<Movie | null> {
    return this.tmdbService.getMovieByTmdbId(tmdbId, movieSummary);
  }

  @traced('MediaService')
  public async getMovieById(id: number): Promise<Movie | null> {
    return this.movieRepository.findById(id);
  }

  public async getTVShowByTmdbId(
    showTmdbId: number,
    tvShowSummary?: TVShowMediaSummary
  ): Promise<TVShow | null> {
    return this.tmdbService.getTVShowByTmdbId(showTmdbId, tvShowSummary);
  }

  @traced('MediaService')
  public async markShowAsWatching(showId: number): Promise<void> {
    await this.tvShowRepository.markAsWatching(showId);
  }

  @traced('MediaService')
  public async mediasWithLanguage(
    medias: (Movie | TVShow)[],
    language: string
  ): Promise<TranslatedMedia[]> {
    const ids = [
      ...new Set<number>(medias.flatMap(media => media.genres?.map(genre => genre.id) ?? [])),
    ];
    const genres = await this.tmdbService.getGenres(ids, [language]);
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
      if (media instanceof Movie) {
        const { genres, translations, ...movie } = media;
        const translation = translations?.find(translation => translation.language === language);
        const translatedGenres = (genres ?? []).map(genre => genreMap[genre.id]);
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
      const translation = translations?.find(translation => translation.language === language);
      const translatedGenres = (genres ?? []).map(genre => genreMap[genre.id]);
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
}
