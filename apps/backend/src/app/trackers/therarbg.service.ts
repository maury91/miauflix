import { HttpService } from '@nestjs/axios';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { Cache } from 'cache-manager';
import PQueue from 'p-queue';

import { Torrent } from '../jackett/jackett.types';
import { parseTorrentInfo } from './utils';
import { Cacheable } from '../utils/cacheable.util';

interface TheRarBgIMDBPost {
  eid: string;
  pid: number;
  category: string | null;
  category_str: 'TV' | 'Movies' | string | null;
  type: string;
  genre: string | null;
  status: string | null;
  name: string;
  short_name: string | null;
  num_files: number;
  size: number;
  size_char: string;
  thumbnail: string;
  seeders: number;
  leechers: number;
  username: string;
  downloads: number;
  added: number;
  descr: string | null;
  imdb: string;
  language: string | null;
  info_hash: string;
  trailer: string | null;
  timestamp: string;
  last_checked: string;
  files: string[] | null;
  images: string[];
  is_recomended: boolean;
  source: string;
  imdb_data: number | object;
}

interface TheRarBgIMDBDetails {
  imdb: object; // not important
  trb_posts: TheRarBgIMDBPost[];
}

interface TherarBgSearchPost {
  pk: string; // ID
  a: number; // Added ( UNIX EPOC in seconds )
  c: 'TV' | 'Movies' | 'Anime';
  s: number; // Size in bytes
  t: string; // Image
  u: string; // Uploader
  n: string; // Name / Title
  se: number; // Seeders
  le: number; // Leechers
  i: string; // IMDB
}

interface TheRarBgSearchResult {
  links: {
    next: null | string;
    previous: null | string;
  };
  count: number;
  page_size: number;
  results: TherarBgSearchPost[];
}

const magnetTracker = [
  'udp://tracker.therarbg.com:6969/announce',
  'udp://tracker.t-rb.org:6969/announce',
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://opentracker.i2p.rocks:6969/announce',
  'udp://tracker.openbittorrent.com:6969/announce',
  'udp://open.demonii.com:1337/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://tracker.moeking.me:6969/announce',
  'udp://tracker1.bt.moack.co.kr:80/announce',
  'udp://tracker.bitsearch.to:1337/announce',
  'udp://explodie.org:6969/announce',
  'udp://tracker.tiny-vps.com:6969/announce',
  'udp://tracker.theoks.net:6969/announce',
  'udp://p4p.arenabg.com:1337/announce',
  'udp://movies.zsw.ca:6969/announce',
]
  .map((tracker) => '&tr=' + tracker)
  .join();

class RateLimited {
  private running = 0;

  constructor(
    private readonly concurrency: number,
    private readonly delay: number
  ) {}

  private queue: (() => Promise<void>)[] = [];

  private runner = async () => {
    if (this.running >= this.concurrency) {
      return;
    }
    const nextJob = this.queue.shift();
    if (nextJob) {
      try {
        await nextJob();
      } catch (err) {
        // ToDo: move to logger
        console.error(err);
      }
      setTimeout(this.runner, this.delay);
    }
  };

  public async rateLimited<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(() => {
        return fn().then(resolve).catch(reject);
      });
      this.runner();
    });
  }
}

@Injectable()
export class TheRarBgService extends RateLimited {
  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly httpService: HttpService
  ) {
    super(5, 100);
  }

  @Cacheable(600 * 1000 /* 10 minutes */)
  private async getIMDBDetail(imdbId: string) {
    return this.rateLimited(() =>
      this.httpService.axiosRef.get<TheRarBgIMDBDetails>(
        `https://therarbg.to/imdb-detail/tt${imdbId}/?format=json`
      )
    );
  }

  @Cacheable(600 * 1000 /* 10 minutes */)
  private async search(q: string, category: 'TV' | 'Movies' | 'Anime') {
    // https://therarbg.to/get-posts/order:-se:keywords:silo%20s02e07:category:TV:ncategory:XXX:format:json/
    return this.rateLimited(() =>
      this.httpService.axiosRef.get<TheRarBgSearchResult>(
        `https://therarbg.to/get-posts/order:-se:keywords:${encodeURI(
          q
        )}:category:${category}:ncategory:XXX:format:json/`
      )
    );
  }

  @Cacheable(600 * 1000 /* 10 minutes */)
  private async getDetails(id: string) {
    // https://therarbg.to/post-detail/72246e/-/?format=json
    return this.rateLimited(() =>
      this.httpService.axiosRef.get<TheRarBgIMDBPost>(
        `https://therarbg.to/post-detail/${id}/-/?format=json`
      )
    );
  }

  public async getTorrentsByIMDB(imdbId: string): Promise<Torrent[]> {
    const { data, status } = await this.getIMDBDetail(imdbId);
    if (status !== 200) {
      if (status === 404 || status === 302) {
        throw new Error('IMDB ID not found');
      }
      throw new Error('Error fetching data');
    }
    return data.trb_posts.map((post) => {
      const {
        season,
        episode,
        title,
        videoCodec,
        videoQuality,
        videoSource,
        year,
      } = parseTorrentInfo(post.name, post.descr);
      return {
        title: post.name,
        guid: post.info_hash,
        isPrivate: false,
        pubDate: new Date(post.timestamp),
        size: post.size,
        category: [],
        urls: [
          {
            url: `https://m2t.mirrorbay.org/info-hash/${
              post.info_hash
            }/${encodeURI(post.name)}/?apikey=therarbg`,
            type: 'application/x-bittorrent',
          },
          {
            url: `http://itorrents.org/torrent/${
              post.info_hash
            }.torrent?title=${encodeURIComponent(post.name)}`,
            type: 'application/x-bittorrent',
          },
          {
            url: `magnet:?xt=urn:btih:${post.info_hash}&dn=${encodeURIComponent(
              post.name
            )}${magnetTracker}`,
            type: 'magnet',
          },
        ],
        codec: videoCodec,
        source: videoSource,
        quality: videoQuality,
        season,
        episode,
        seeders: post.seeders,
        peers: post.leechers,
        mediaName: title,
        mediaYear: year,
        type: post.category_str === 'TV' ? 'tv' : 'movie',
        infoHash: post.info_hash,
        imdb: imdbId.replace('tt', ''),
      };
    });
  }
}
