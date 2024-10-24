import { Inject, Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { ConfigurationResponse, MovieImagesResponse } from './tmdb.types';
import { AxiosRequestConfig } from 'axios';
import { Cacheable } from '../utils/cacheable.util';
import getPixels from 'get-pixels';
import { extractColors } from 'extract-colors';
import { FinalColor } from 'extract-colors/lib/types/Color';

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

  private async getImageColor(imageUrl: string): Promise<FinalColor[]> {
    return new Promise((resolve, reject) => {
      getPixels(imageUrl, (err, pixels) => {
        if (err) {
          return reject(err);
        }
        extractColors({
          data: [...pixels.data],
          width: pixels.shape.width,
          height: pixels.shape.height,
        }).then(resolve, reject);
      });
    });
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
        // .map(async (backdrop) => ({
        //   ...backdrop,
        //   colors: await this.getImageColor(backdrop.file_path),
        // }))
      ),
      Promise.all(
        data.logos
          .map((logo) => ({
            ...logo,
            file_path: `${config.images.secure_base_url}original${logo.file_path}`,
          }))
          .slice(0, 5)
        // .map(async (backdrop) => ({
        //   ...backdrop,
        //   colors: await this.getImageColor(backdrop.file_path),
        // }))
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
}
