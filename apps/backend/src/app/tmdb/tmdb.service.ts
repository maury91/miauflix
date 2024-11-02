import { Inject, Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { ConfigurationResponse, MovieImagesResponse } from './tmdb.types';
import { AxiosRequestConfig } from 'axios';
import { Cacheable } from '../utils/cacheable.util';
import { MovieDto, MovieImages } from '@miauflix/types';

@Injectable()
export class TMDBService {
  private readonly apiUrl: string;
  private readonly apiKey: string;

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService
  ) {
    this.apiUrl = this.configService.getOrThrow('TMDB_API_URL');
    this.apiKey = this.configService.getOrThrow('TMDB_API_ACCESS_TOKEN');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private get<T, D = any>(url: string, config?: AxiosRequestConfig<D>) {
    return this.httpService.axiosRef.get<T>(url, {
      ...(config ?? {}),
      headers: {
        ...(config?.headers ?? {}),
        Authorization: `Bearer ${this.apiKey}`,
      },
    });
  }

  @Cacheable(26e8 /* 30 days */)
  public async getConfiguration() {
    const { data } = await this.get<ConfigurationResponse>(
      `${this.apiUrl}/configuration`
    );
    return data;
  }

  private async getMovieImagesRaw(movieId: string) {
    const { data } = await this.get<MovieImagesResponse>(
      `${this.apiUrl}/movie/${movieId}/images`,
      {
        params: {
          include_image_language: 'en,null',
          language: 'en',
        },
      }
    );
    if (
      !data ||
      data.backdrops.length + data.logos.length + data.posters.length === 0
    ) {
      return (
        await this.get<MovieImagesResponse>(
          `${this.apiUrl}/movie/${movieId}/images`
        )
      ).data;
    }
    return data;
  }

  @Cacheable(864e5 /* 1 day */, true)
  public async getMovieImages(movieId: string) {
    const [config, data] = await Promise.all([
      this.getConfiguration(),
      this.getMovieImagesRaw(movieId),
    ]);

    const [backdropsWithoutText, logos] = await Promise.all([
      Promise.all(
        data.backdrops
          .filter((backdrop) => backdrop.iso_639_1 === null)
          .map((backdrop) => ({
            ...backdrop,
            file_path: `${config.images.secure_base_url}original${backdrop.file_path}`,
          }))
          .slice(0, 10)
      ),
      Promise.all(
        data.logos
          .map((logo) => ({
            ...logo,
            file_path: `${config.images.secure_base_url}original${logo.file_path}`,
          }))
          .slice(0, 5)
      ),
    ]);

    return {
      ...data,
      posters: data.posters.map((poster) => ({
        ...poster,
        file_path: `${config.images.secure_base_url}original${poster.file_path}`,
      })),
      backdrops: data.backdrops
        .filter((backdrop) => backdrop.iso_639_1 !== null)
        .map((backdrop) => ({
          ...backdrop,
          file_path: `${config.images.secure_base_url}original${backdrop.file_path}`,
        }))
        .slice(0, 5),
      backdropsWithoutText,
      logos,
    };
  }

  public async getSimpleMovieImages(movieId: string): Promise<MovieImages> {
    const movieImages = await this.getMovieImages(movieId);
    return {
      poster: movieImages.posters[0]?.file_path ?? '',
      backdrop: movieImages.backdrops[0]?.file_path ?? '',
      backdrops: movieImages.backdropsWithoutText.map(
        ({ file_path }) => file_path
      ),
      logos: movieImages.logos.map(({ file_path }) => file_path),
    };
  }

  public async addImagesToMovies(
    movies: MovieDto[]
  ): Promise<[MovieDto[], string[]]> {
    const moviesWithoutImages: string[] = [];

    return [
      await Promise.all(
        movies.map(async (movie) => {
          if (!movie.images.poster) {
            const images = await this.getSimpleMovieImages(`${movie.ids.tmdb}`);
            const newMovie: MovieDto = {
              ...movie,
              images,
            };
            moviesWithoutImages.push(newMovie.id);
            return newMovie;
          }
          return movie;
        })
      ),
      moviesWithoutImages,
    ];
  }
}
