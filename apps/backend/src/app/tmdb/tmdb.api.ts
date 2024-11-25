import { Global, Inject, Injectable, Module } from '@nestjs/common';
import { HttpModule, HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { ConfigurationResponse, ImagesResponse, MediaType } from './tmdb.types';
import { AxiosRequestConfig } from 'axios';
import { Cacheable } from '../utils/cacheable.util';
import { MediaImages } from '@miauflix/types';

export const NO_IMAGES: MediaImages = {
  logos: [],
  backdrop: '',
  backdrops: [],
  poster: '',
};

@Injectable()
export class TMDBApi {
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

  @Cacheable(864e5 /* 1 day */, true)
  private async getMediaImagesRaw(type: MediaType, mediaId: number | string) {
    const { data } = await this.get<ImagesResponse>(
      `${this.apiUrl}/${type}/${mediaId}/images`,
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
        await this.get<ImagesResponse>(
          `${this.apiUrl}/${type}/${mediaId}/images`
        )
      ).data;
    }
    return data;
  }

  @Cacheable(864e5 /* 1 day */, true)
  public async getMediaImages(type: MediaType, mediaId: number | string) {
    const [config, data] = await Promise.all([
      this.getConfiguration(),
      this.getMediaImagesRaw(type, mediaId),
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

  public async getSimpleMediaImages(
    type: MediaType,
    mediaId: number | string
  ): Promise<MediaImages> {
    const mediaImages = await this.getMediaImages(type, mediaId);
    return {
      poster: mediaImages.posters[0]?.file_path ?? '',
      backdrop: mediaImages.backdrops[0]?.file_path ?? '',
      backdrops: mediaImages.backdropsWithoutText.map(
        ({ file_path }) => file_path
      ),
      logos: mediaImages.logos.map(({ file_path }) => file_path),
    };
  }

  public async addImagesToMedias<
    T extends { images: MediaImages; id: string; ids: { tmdb: number } }
  >(type: MediaType, medias: T[]): Promise<[T[], string[]]> {
    const mediasWithoutImages: string[] = [];

    return [
      await Promise.all(
        medias.map(async (media) => {
          if (!media.images.poster) {
            const images = await this.getSimpleMediaImages(
              type,
              media.ids.tmdb
            );
            const newMedia: T = {
              ...media,
              images,
            };
            mediasWithoutImages.push(newMedia.id);
            return newMedia;
          }
          return media;
        })
      ),
      mediasWithoutImages,
    ];
  }
}

@Global()
@Module({
  imports: [HttpModule],
  providers: [TMDBApi],
  exports: [TMDBApi],
})
export class TMDBApiModule {}
