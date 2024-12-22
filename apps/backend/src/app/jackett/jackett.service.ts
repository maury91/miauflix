import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { xml2js } from 'xml-js';
import {
  CategoryType,
  JackettAllTrackerResponse,
  JackettIndexersResponse,
  JackettQueryResponse,
  JackettSimplifiedTracker,
  QueryParamsArgs,
  Torrent,
} from './jackett.types';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import {
  getCategoriesByType,
  getInnerSearchType,
  getVideoCodec,
  getVideoQuality,
  getVideoSource,
  simplifyTracker,
  simplifyXMLObject,
} from './jackett.utils';
import { Cacheable } from '../utils/cacheable.util';
import { asArray } from '../utils/array';

const trackerPreference: Record<CategoryType, string[]> = {
  movie: ['1337x', 'badasstorrents', 'therarbg'],
  tv: ['eztv', 'therarbg', 'limetorrents', '1337x'],
  anime: ['nyaasi', 'subsplease'],
};

const compareTrackerPreference =
  (category: CategoryType) =>
  (a: JackettSimplifiedTracker, b: JackettSimplifiedTracker) => {
    const aIndex = trackerPreference[category].indexOf(a.id);
    const bIndex = trackerPreference[category].indexOf(b.id);
    if (aIndex === -1 && bIndex === -1) {
      return 0;
    }
    if (aIndex === -1) {
      return 1;
    }
    if (bIndex === -1) {
      return -1;
    }
    return aIndex - bIndex;
  };

@Injectable()
export class JackettService {
  private readonly apiUrl: string;
  private readonly apiKey: string;

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService
  ) {
    this.apiUrl = this.configService.getOrThrow('JACKETT_API_URL');
    this.apiKey = this.configService.getOrThrow('JACKETT_API_KEY');
  }

  private async get<T>(url: string, params: Record<string, string>) {
    const { data, status, statusText, headers } =
      await this.httpService.axiosRef.get<string>(
        `${this.apiUrl}/api/v2.0/${url}`,
        {
          params: {
            ...params,
            apikey: this.apiKey,
          },
        }
      );

    return {
      data: simplifyXMLObject(
        xml2js(data, {
          compact: true,
          ignoreDeclaration: true,
          nativeType: true,
        })
      ) as T,
      status,
      statusText,
      headers,
    };
  }

  @Cacheable(60 * 1000 /* 1 minute */)
  public async getAllTrackers() {
    const { data: rawData } = await this.get<JackettIndexersResponse>(
      `indexers/all/results/torznab`,
      {
        t: 'indexers',
        configured: 'true',
      }
    );
    const indexers: JackettAllTrackerResponse = rawData.indexers.indexer
      .filter(({ configured }) => configured === 'true')
      .map((indexer) => ({
        id: indexer.id,
        title: indexer.title,
        description: indexer.description,
        language: indexer.language,
        isPrivate: indexer.type === 'private',
        maxLimit: parseInt(indexer.caps.limits.max, 10),
        defaultLimit: parseInt(indexer.caps.limits.default, 10),
        categories: getCategoriesByType(indexer),
        searching: {
          search: {
            available: indexer.caps.searching.search.available === 'yes',
            supportedParams:
              indexer.caps.searching.search.supportedParams.split(','),
          },
          tvSearch: {
            available: indexer.caps.searching['tv-search'].available === 'yes',
            supportedParams:
              indexer.caps.searching['tv-search'].supportedParams.split(','),
          },
          movie: {
            available:
              indexer.caps.searching['movie-search'].available === 'yes',
            supportedParams:
              indexer.caps.searching['movie-search'].supportedParams.split(','),
          },
        },
      }));

    return indexers;
  }

  public async getTrackersByCategory(targetCategory: CategoryType) {
    const allTrackers = await this.getAllTrackers();
    return allTrackers
      .filter((tracker) => tracker.categories[targetCategory].length > 0)
      .map(simplifyTracker(targetCategory))
      .sort(compareTrackerPreference(targetCategory));
  }

  @Cacheable(1800 * 1000 /* 30 minutes */, true)
  private async queryTrackerRaw<ST extends CategoryType>(
    trackerId: string,
    searchType: ST,
    queryParams: QueryParamsArgs[ST],
    limit?: number
  ) {
    const tracker = (await this.getAllTrackers()).find(
      (tracker) => tracker.id === trackerId
    );
    if (!tracker) {
      throw new Error('Tracker not found');
    }

    const innerSearchType = getInnerSearchType(searchType, tracker);

    if (!tracker.searching[innerSearchType].available) {
      throw new Error('Tracker not searchable');
    }

    const supportedParams = Object.keys(queryParams).filter((param) =>
      tracker.searching[innerSearchType].supportedParams.includes(param)
    );

    const params = supportedParams.reduce(
      (acc, param) => ({
        ...acc,
        [param]: queryParams[param],
      }),
      {}
    );

    try {
      console.log(
        'executing query',
        `indexers/${trackerId}/results/torznab/api`,
        {
          t: innerSearchType.toLowerCase(),
          ...params,
          cat: tracker.categories[searchType].map(({ id }) => id).join(','),
          ...(typeof limit === 'number' ? { limit: `${limit}` } : {}),
        }
      );
      const { data } = await this.get<JackettQueryResponse>(
        `indexers/${trackerId}/results/torznab/api`,
        {
          t: innerSearchType.toLowerCase(),
          ...params,
          cat: tracker.categories[searchType].map(({ id }) => id).join(','),
          ...(typeof limit === 'number' ? { limit: `${limit}` } : {}),
        }
      );

      return data;
    } catch (err) {
      if (
        'response' in err &&
        typeof err.response.data === 'string' &&
        err.response.data.toLowerCase().includes('challenge detected')
      ) {
        throw new Error('Challenge detected, configure FlareSolverr');
      }
      throw err;
    }
  }

  public async queryTracker<ST extends CategoryType>({
    trackerId,
    searchType,
    queryParams,
    limit,
    airedOn,
  }: {
    trackerId: string;
    searchType: ST;
    queryParams: QueryParamsArgs[ST];
    limit?: number;
    airedOn?: Date;
  }) {
    const data = await this.queryTrackerRaw(
      trackerId,
      searchType,
      queryParams,
      limit
    );
    try {
      if (!data.rss.channel.item) {
        console.log(
          `no results found for tracker ${trackerId} for query ${JSON.stringify(
            queryParams
          )}`
        );
        return [];
      }
      return asArray(data.rss.channel.item)
        .map<Torrent>((item) => {
          const seeders = parseInt(
            item['torznab:attr'].find(({ name }) => name === 'seeders')
              ?.value ?? '0'
          );
          const peers = parseInt(
            item['torznab:attr'].find(({ name }) => name === 'peers')?.value ??
              '0'
          );
          const [season, episode] = item.title
            .match(/\bS(\d+)E(\d+)\b/)
            ?.slice(1)
            .map(Number) ?? [0, 0];
          return {
            title: item.title,
            guid: item.guid,
            isPrivate: item.type === 'private',
            pubDate: new Date(item.pubDate),
            size: item.size,
            category: asArray(item.category),
            url: item.enclosure.url,
            urlType: item.enclosure.type,
            codec: getVideoCodec(item.title),
            source: getVideoSource(item.title),
            quality: getVideoQuality(item.title),
            season,
            episode,
            seeders,
            peers,
          };
        })
        .filter(({ pubDate }) => {
          return (
            !airedOn ||
            pubDate.getTime() >= airedOn.getTime() - 259200000 /* 3 day */
          );
        })
        .sort((a, b) => {
          if (a.quality === b.quality) {
            return b.seeders * 5 + b.peers - (a.seeders * 5 + a.peers);
          }
          return b.quality - a.quality;
        });
      // .filter((torrent) => torrent.quality !== undefined);
    } catch (err) {
      console.error('Failed to process tracker data', err, data);
      throw err;
    }
  }
}
