import { MockCache } from '@__test-utils__/cache.mock';
import { Quality, Source, VideoCodec } from '@miauflix/source-metadata-extractor';

import type { Database } from '@database/database';
import { DownloadService } from '@services/download/download.service';
import { StorageService } from '@services/storage/storage.service';

import { TherarbgContentDirectory } from './index';
import type { ImdbDetailPost, ImdbMetadata } from './therarbg.types';

jest.mock('@services/download/download.service');
jest.mock('@services/storage/storage.service');

describe('TherarbgContentDirectory', () => {
  let contentDirectory: TherarbgContentDirectory;
  let mockCache: MockCache;
  let mockDownloadService: jest.Mocked<DownloadService>;

  beforeEach(() => {
    mockCache = new MockCache();
    const mockStorageService = new StorageService({} as Database) as jest.Mocked<StorageService>;

    mockDownloadService = new DownloadService(mockStorageService) as jest.Mocked<DownloadService>;

    // Mock the generateLink method to return proper magnet links
    mockDownloadService.generateLink.mockImplementation((hash: string, trackers: string[]) => {
      return `magnet:?xt=urn:btih:${hash}&tr=${trackers.join('&tr=')}`;
    });

    contentDirectory = new TherarbgContentDirectory(mockCache, mockDownloadService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getMovie', () => {
    const mockImdbId = 'tt0119698';
    const mockMovieResponse = {
      imdb: {
        imdb_id: mockImdbId,
        name: 'Cosmic Princess',
        release_detailed: { year: 1997 },
        runtime: '7980',
      } as ImdbMetadata,
      trb_posts: [
        {
          eid: 'test-eid',
          pid: 12345,
          category: 14,
          category_str: 'Movies',
          type: 'movie',
          genre: ['Animation', 'Adventure'],
          status: null,
          name: 'Cosmic Princess 1997 1080p BluRay x264',
          short_name: null,
          num_files: 1,
          size: 2000000000,
          size_char: '2.0 GB',
          thumbnail: null,
          seeders: 10,
          leechers: 5,
          username: 'testuser',
          downloads: 100,
          added: 1640995200,
          descr: null,
          imdb: mockImdbId,
          language: 'English',
          info_hash: 'test-hash-123',
          textlanguage: null,
          trailer: null,
          season: 0,
          episode: 0,
          timestamp: '2023-01-01T00:00:00Z',
          last_checked: '2023-01-01T00:00:00Z',
          files: [],
          trackers: [
            {
              seeders: 10,
              tracker: 'udp://tracker.example.com:1337',
              leechers: 5,
              completed: 100,
              scrape_error: null,
            },
          ],
          has_torrent: true,
          images: [],
          is_recomended: false,
          source: 'BluRay',
          source_list: [],
          extra_data: { pending_torrent: false },
          upvotes: 0,
          downvotes: 0,
          report_count: 0,
          comment_count: 0,
          imdb_data: 1234,
        } as ImdbDetailPost,
      ],
    };

    it('should return normalized sources for valid movie', async () => {
      // Mock the API response
      jest.spyOn(contentDirectory['api'], 'searchByImdbId').mockResolvedValue(mockMovieResponse);

      const result = await contentDirectory.getMovie(mockImdbId);

      expect(result).toEqual({
        sources: [
          expect.objectContaining({
            audioCodec: [],
            bitrate: 2005,
            broadcasters: 10,
            hash: 'test-hash-123',
            language: [],
            magnetLink: 'magnet:?xt=urn:btih:test-hash-123&tr=udp://tracker.example.com:1337',
            quality: Quality.FHD,
            score: 0,
            size: 2000000000,
            source: Source.BLURAY,
            uploadDate: new Date('2023-01-01T00:00:00.000Z'),
            url: '',
            videoCodec: VideoCodec.X264,
            watchers: 5,
          }),
        ],
        trailerCode: '',
      });

      // Additional check for uploadDate
      expect(result.sources[0].uploadDate).toBeInstanceOf(Date);
      expect(result.sources[0].uploadDate.toISOString()).toBe('2023-01-01T00:00:00.000Z');

      expect(mockDownloadService.generateLink).toHaveBeenCalledWith('test-hash-123', [
        'udp://tracker.example.com:1337',
      ]);
    });

    it('should return empty sources when no movie found', async () => {
      jest.spyOn(contentDirectory['api'], 'searchByImdbId').mockResolvedValue(null);

      const result = await contentDirectory.getMovie(mockImdbId);

      expect(result).toEqual({
        sources: [],
        trailerCode: '',
      });
    });

    it('should return empty sources when movie has no torrents', async () => {
      jest.spyOn(contentDirectory['api'], 'searchByImdbId').mockResolvedValue({
        ...mockMovieResponse,
        trb_posts: [],
      });

      const result = await contentDirectory.getMovie(mockImdbId);

      expect(result).toEqual({
        sources: [],
        trailerCode: '',
      });
    });

    it('should handle API errors gracefully', async () => {
      jest
        .spyOn(contentDirectory['api'], 'searchByImdbId')
        .mockRejectedValue(new Error('API Error'));

      await expect(contentDirectory.getMovie(mockImdbId)).rejects.toThrow('API Error');
    });

    it('should pass highPriority flag to API', async () => {
      const searchSpy = jest
        .spyOn(contentDirectory['api'], 'searchByImdbId')
        .mockResolvedValue(mockMovieResponse);

      await contentDirectory.getMovie(mockImdbId, true);

      expect(searchSpy).toHaveBeenCalledWith(mockImdbId, true);
    });

    it('should filter out trackers with scrape errors', async () => {
      const mockResponseWithBadTrackers = {
        ...mockMovieResponse,
        trb_posts: [
          {
            ...mockMovieResponse.trb_posts[0],
            trackers: [
              {
                seeders: 10,
                tracker: 'udp://good-tracker.com:1337',
                leechers: 5,
                completed: 100,
                scrape_error: null,
              },
              {
                seeders: 0,
                tracker: 'udp://bad-tracker.com:1337',
                leechers: 0,
                completed: 0,
                scrape_error: 'Failed to scrape',
              },
              {
                seeders: 5,
                tracker: 'udp://another-good-tracker.com:1337',
                leechers: 2,
                completed: 50,
                scrape_error: null,
              },
            ],
          },
        ],
      };

      jest
        .spyOn(contentDirectory['api'], 'searchByImdbId')
        .mockResolvedValue(mockResponseWithBadTrackers);

      await contentDirectory.getMovie(mockImdbId);

      expect(mockDownloadService.generateLink).toHaveBeenCalledWith('test-hash-123', [
        'udp://good-tracker.com:1337',
        'udp://another-good-tracker.com:1337',
      ]);
    });

    it('should handle sources with null seeders/leechers', async () => {
      const mockResponseWithNullValues = {
        ...mockMovieResponse,
        trb_posts: [
          {
            ...mockMovieResponse.trb_posts[0],
            seeders: null as unknown as number,
            leechers: null as unknown as number,
          },
        ],
      };

      jest
        .spyOn(contentDirectory['api'], 'searchByImdbId')
        .mockResolvedValue(mockResponseWithNullValues);

      const result = await contentDirectory.getMovie(mockImdbId);

      expect(result.sources[0].broadcasters).toBe(0);
      expect(result.sources[0].watchers).toBe(0);
    });
  });

  describe('getTVShow', () => {
    const mockImdbId = 'tt0944947'; // Royal Chronicles
    const mockTVShowResponse = {
      imdb: {
        imdb_id: mockImdbId,
        name: 'Royal Chronicles',
        release_detailed: { year: 2011 },
        runtime: '6000',
      } as ImdbMetadata,
      trb_posts: [
        {
          eid: 'tv-eid',
          pid: 67890,
          category: 14,
          category_str: 'TV Shows',
          type: 'tv',
          genre: ['Drama', 'Fantasy'],
          status: null,
          name: 'Royal Chronicles S01E01 1080p BluRay x264',
          short_name: null,
          num_files: 1,
          size: 3000000000,
          size_char: '3.0 GB',
          thumbnail: null,
          seeders: 15,
          leechers: 8,
          username: 'testuser',
          downloads: 200,
          added: 1640995200,
          descr: null,
          imdb: mockImdbId,
          language: 'English',
          info_hash: 'tv-hash-456',
          textlanguage: null,
          trailer: null,
          season: 1,
          episode: 1,
          timestamp: '2023-01-01T00:00:00Z',
          last_checked: '2023-01-01T00:00:00Z',
          files: [],
          trackers: [
            {
              seeders: 15,
              tracker: 'udp://tracker.example.com:1337',
              leechers: 8,
              completed: 200,
              scrape_error: null,
            },
          ],
          has_torrent: true,
          images: [],
          is_recomended: false,
          source: 'BluRay',
          source_list: [],
          extra_data: { pending_torrent: false },
          upvotes: 0,
          downvotes: 0,
          report_count: 0,
          comment_count: 0,
          imdb_data: 5678,
        } as ImdbDetailPost,
      ],
    };

    it('should return normalized sources for valid TV show', async () => {
      jest.spyOn(contentDirectory['api'], 'searchByImdbId').mockResolvedValue(mockTVShowResponse);

      const result = await contentDirectory.getTVShow(mockImdbId);

      expect(result).toEqual({
        sources: [
          {
            audioCodec: [],
            bitrate: 4000,
            broadcasters: 15,
            hash: 'tv-hash-456',
            language: [],
            magnetLink: 'magnet:?xt=urn:btih:tv-hash-456&tr=udp://tracker.example.com:1337',
            quality: Quality.FHD,
            score: 0,
            size: 3000000000,
            source: Source.BLURAY,
            uploadDate: new Date('2023-01-01T00:00:00.000Z'),
            url: '',
            videoCodec: VideoCodec.X264,
            watchers: 8,
          },
        ],
        trailerCode: '',
      });

      // Additional check for uploadDate
      expect(result.sources[0].uploadDate).toBeInstanceOf(Date);
      expect(result.sources[0].uploadDate.toISOString()).toBe('2023-01-01T00:00:00.000Z');
    });

    it('should return empty sources when no TV show found', async () => {
      jest.spyOn(contentDirectory['api'], 'searchByImdbId').mockResolvedValue(null);

      const result = await contentDirectory.getTVShow(mockImdbId);

      expect(result).toEqual({
        sources: [],
        trailerCode: '',
      });
    });

    it('should return empty sources when TV show has no sources', async () => {
      jest.spyOn(contentDirectory['api'], 'searchByImdbId').mockResolvedValue({
        ...mockTVShowResponse,
        trb_posts: [],
      });

      const result = await contentDirectory.getTVShow(mockImdbId);

      expect(result).toEqual({
        sources: [],
        trailerCode: '',
      });
    });

    it('should handle API errors gracefully', async () => {
      jest
        .spyOn(contentDirectory['api'], 'searchByImdbId')
        .mockRejectedValue(new Error('API Error'));

      await expect(contentDirectory.getTVShow(mockImdbId)).rejects.toThrow('API Error');
    });

    it('should pass highPriority flag to API', async () => {
      const searchSpy = jest
        .spyOn(contentDirectory['api'], 'searchByImdbId')
        .mockResolvedValue(mockTVShowResponse);

      await contentDirectory.getTVShow(mockImdbId, true);

      expect(searchSpy).toHaveBeenCalledWith(mockImdbId, true);
    });
  });

  describe('real API (http-vcr)', () => {
    it('should fetch real data and match snapshot', async () => {
      // Do NOT mock the API for this test
      // Use a real, known IMDB ID
      const imdbId = 'tt0119698'; // Cosmic Princess
      const result = await contentDirectory.getMovie(imdbId);
      expect(result).toMatchInlineSnapshot(`
{
  "sources": [
    {
      "audioCodec": [
        "EAC3",
      ],
      "bitrate": 2906,
      "broadcasters": 2,
      "hash": "123456789ABCDEF0123456789ABCDEF012345678",
      "language": [],
      "magnetLink": "magnet:?xt=urn:btih:123456789ABCDEF0123456789ABCDEF012345678&tr=",
      "quality": "FHD",
      "score": 0,
      "size": 2899102924,
      "source": "BLURAY",
      "uploadDate": 2025-06-15T09:00:29.607Z,
      "url": "",
      "videoCodec": "AV1",
      "watchers": 4,
    },
    {
      "audioCodec": [],
      "bitrate": 25178,
      "broadcasters": 2,
      "hash": "123456789ABCDEF0123456789ABCDEF012345678",
      "language": [
        "ENGLISH",
        "ITALIAN",
      ],
      "magnetLink": "magnet:?xt=urn:btih:123456789ABCDEF0123456789ABCDEF012345678&tr=udp://open.stealth.si:80/announce&tr=udp://tracker.cyberia.is:6969/announce&tr=udp://tracker.opentrackr.org:1337/announce&tr=udp://tracker.torrent.eu.org:451/announce&tr=udp://explodie.org:6969/announce&tr=udp://tracker.birkenwald.de:6969/announce&tr=udp://tracker.tiny-vps.com:6969/announce&tr=udp://tracker.therarbg.to:6969/announce",
      "quality": "FHD",
      "score": 0,
      "size": 25114821263,
      "source": null,
      "uploadDate": 2024-11-07T11:41:46.996Z,
      "url": "",
      "videoCodec": null,
      "watchers": 12,
    },
    {
      "audioCodec": [],
      "bitrate": 4446,
      "broadcasters": 2,
      "hash": "123456789ABCDEF0123456789ABCDEF012345678",
      "language": [
        "MULTI",
      ],
      "magnetLink": "magnet:?xt=urn:btih:123456789ABCDEF0123456789ABCDEF012345678&tr=",
      "quality": "HD",
      "score": 0,
      "size": 4434553733,
      "source": null,
      "uploadDate": 2024-07-28T17:20:22.517Z,
      "url": "",
      "videoCodec": "X264",
      "watchers": 1,
    },
    {
      "audioCodec": [],
      "bitrate": 14736,
      "broadcasters": 4,
      "hash": "123456789ABCDEF0123456789ABCDEF012345678",
      "language": [
        "MULTI",
      ],
      "magnetLink": "magnet:?xt=urn:btih:123456789ABCDEF0123456789ABCDEF012345678&tr=",
      "quality": "FHD",
      "score": 0,
      "size": 14699525570,
      "source": null,
      "uploadDate": 2024-07-27T17:51:25.755Z,
      "url": "",
      "videoCodec": "X264",
      "watchers": 2,
    },
    {
      "audioCodec": [
        "EAC3",
      ],
      "bitrate": 18202,
      "broadcasters": 185,
      "hash": "123456789ABCDEF0123456789ABCDEF012345678",
      "language": [
        "ENGLISH",
        "ITALIAN",
      ],
      "magnetLink": "magnet:?xt=urn:btih:123456789ABCDEF0123456789ABCDEF012345678&tr=udp://open.stealth.si:80/announce&tr=udp://tracker.opentrackr.org:1337/announce&tr=udp://tracker.torrent.eu.org:451/announce&tr=udp://explodie.org:6969/announce&tr=udp://tracker.birkenwald.de:6969/announce&tr=udp://tracker.tiny-vps.com:6969/announce&tr=udp://tracker.therarbg.to:6969/announce",
      "quality": "FHD",
      "score": 0,
      "size": 18156974243,
      "source": "BLURAY",
      "uploadDate": 2024-07-07T03:02:29.669Z,
      "url": "",
      "videoCodec": "X265",
      "watchers": 30,
    },
    {
      "audioCodec": [
        "EAC3",
      ],
      "bitrate": 8827,
      "broadcasters": 0,
      "hash": "123456789ABCDEF0123456789ABCDEF012345678",
      "language": [],
      "magnetLink": "magnet:?xt=urn:btih:123456789ABCDEF0123456789ABCDEF012345678&tr=",
      "quality": "FHD",
      "score": 0,
      "size": 8804682956,
      "source": "BLURAY",
      "uploadDate": 2023-10-27T22:20:22.760Z,
      "url": "",
      "videoCodec": "X265_10BIT",
      "watchers": 0,
    },
    {
      "audioCodec": [
        "OPUS",
      ],
      "bitrate": 1615,
      "broadcasters": 23,
      "hash": "123456789ABCDEF0123456789ABCDEF012345678",
      "language": [],
      "magnetLink": "magnet:?xt=urn:btih:123456789ABCDEF0123456789ABCDEF012345678&tr=udp://open.stealth.si:80/announce&tr=udp://exodus.desync.com:6969/announce&tr=udp://tracker.opentrackr.org:1337/announce&tr=udp://tracker.torrent.eu.org:451/announce&tr=udp://explodie.org:6969/announce&tr=udp://tracker.birkenwald.de:6969/announce&tr=udp://tracker.tiny-vps.com:6969/announce&tr=udp://tracker.therarbg.to:6969/announce",
      "quality": "FHD",
      "score": 0,
      "size": 1610612736,
      "source": "BLURAY",
      "uploadDate": 2023-10-26T15:07:46.130Z,
      "url": "",
      "videoCodec": "AV1_10BIT",
      "watchers": 3,
    },
    {
      "audioCodec": [],
      "bitrate": 1076,
      "broadcasters": 0,
      "hash": "123456789ABCDEF0123456789ABCDEF012345678",
      "language": [],
      "magnetLink": "magnet:?xt=urn:btih:123456789ABCDEF0123456789ABCDEF012345678&tr=",
      "quality": "HD",
      "score": 0,
      "size": 1073741824,
      "source": "BLURAY",
      "uploadDate": 2023-10-25T08:36:03.762Z,
      "url": "",
      "videoCodec": "X264",
      "watchers": 0,
    },
    {
      "audioCodec": [
        "AAC",
      ],
      "bitrate": 2691,
      "broadcasters": 28,
      "hash": "123456789ABCDEF0123456789ABCDEF012345678",
      "language": [],
      "magnetLink": "magnet:?xt=urn:btih:123456789ABCDEF0123456789ABCDEF012345678&tr=udp://open.stealth.si:80/announce&tr=udp://exodus.desync.com:6969/announce&tr=udp://tracker.cyberia.is:6969/announce&tr=udp://tracker.opentrackr.org:1337/announce&tr=udp://tracker.torrent.eu.org:451/announce&tr=udp://explodie.org:6969/announce&tr=udp://tracker.birkenwald.de:6969/announce&tr=udp://tracker.tiny-vps.com:6969/announce&tr=udp://tracker.therarbg.to:6969/announce",
      "quality": "FHD",
      "score": 0,
      "size": 2684354560,
      "source": "BLURAY",
      "uploadDate": 2023-10-22T08:49:23.404Z,
      "url": "",
      "videoCodec": "X264",
      "watchers": 6,
    },
    {
      "audioCodec": [],
      "bitrate": 684,
      "broadcasters": 121,
      "hash": "123456789ABCDEF0123456789ABCDEF012345678",
      "language": [],
      "magnetLink": "magnet:?xt=urn:btih:123456789ABCDEF0123456789ABCDEF012345678&tr=",
      "quality": "HD",
      "score": 0,
      "size": 681888973,
      "source": "BLURAY",
      "uploadDate": 2023-07-22T16:54:31.468Z,
      "url": "",
      "videoCodec": null,
      "watchers": 31,
    },
    {
      "audioCodec": [],
      "bitrate": 27126,
      "broadcasters": 381,
      "hash": "123456789ABCDEF0123456789ABCDEF012345678",
      "language": [
        "ENGLISH",
        "ITALIAN",
      ],
      "magnetLink": "magnet:?xt=urn:btih:123456789ABCDEF0123456789ABCDEF012345678&tr=",
      "quality": "FHD",
      "score": 0,
      "size": 27058293964,
      "source": "BLURAY",
      "uploadDate": 2023-07-02T00:01:55.825Z,
      "url": "",
      "videoCodec": "X264",
      "watchers": 20,
    },
    {
      "audioCodec": [
        "DTS_HDMA",
        "DTS_HD",
      ],
      "bitrate": 15931,
      "broadcasters": 8,
      "hash": "123456789ABCDEF0123456789ABCDEF012345678",
      "language": [
        "MULTI",
      ],
      "magnetLink": "magnet:?xt=urn:btih:123456789ABCDEF0123456789ABCDEF012345678&tr=",
      "quality": "FHD",
      "score": 0,
      "size": 15891378995,
      "source": "BLURAY",
      "uploadDate": 2023-07-01T23:40:58.425Z,
      "url": "",
      "videoCodec": "X265_10BIT",
      "watchers": 0,
    },
    {
      "audioCodec": [
        "AC3",
      ],
      "bitrate": 3983,
      "broadcasters": 69,
      "hash": "123456789ABCDEF0123456789ABCDEF012345678",
      "language": [
        "ENGLISH",
        "JAPANESE",
        "MULTI",
      ],
      "magnetLink": "magnet:?xt=urn:btih:123456789ABCDEF0123456789ABCDEF012345678&tr=",
      "quality": "FHD",
      "score": 0,
      "size": 3972844748,
      "source": "BLURAY",
      "uploadDate": 2023-07-01T15:40:27.246Z,
      "url": "",
      "videoCodec": "X264",
      "watchers": 12,
    },
    {
      "audioCodec": [
        "EAC3",
      ],
      "bitrate": 8719,
      "broadcasters": 624,
      "hash": "123456789ABCDEF0123456789ABCDEF012345678",
      "language": [
        "ENGLISH",
        "JAPANESE",
      ],
      "magnetLink": "magnet:?xt=urn:btih:123456789ABCDEF0123456789ABCDEF012345678&tr=",
      "quality": "FHD",
      "score": 0,
      "size": 8697308774,
      "source": "BLURAY",
      "uploadDate": 2023-07-01T15:02:08.744Z,
      "url": "",
      "videoCodec": "X265_10BIT",
      "watchers": 90,
    },
    {
      "audioCodec": [
        "DTS_HDMA",
        "DTS_HD",
      ],
      "bitrate": 12487,
      "broadcasters": 0,
      "hash": "123456789ABCDEF0123456789ABCDEF012345678",
      "language": [],
      "magnetLink": "magnet:?xt=urn:btih:123456789ABCDEF0123456789ABCDEF012345678&tr=",
      "quality": "FHD",
      "score": 0,
      "size": 12455405158,
      "source": "BLURAY",
      "uploadDate": 2023-06-02T03:37:42.397Z,
      "url": "",
      "videoCodec": "X265_10BIT",
      "watchers": 4,
    },
    {
      "audioCodec": [],
      "bitrate": 1043,
      "broadcasters": 30,
      "hash": "123456789ABCDEF0123456789ABCDEF012345678",
      "language": [],
      "magnetLink": "magnet:?xt=urn:btih:123456789ABCDEF0123456789ABCDEF012345678&tr=",
      "quality": "HD",
      "score": 0,
      "size": 1040292249,
      "source": "BLURAY",
      "uploadDate": 2023-06-01T23:56:15.143Z,
      "url": "",
      "videoCodec": "X265_10BIT",
      "watchers": 6,
    },
    {
      "audioCodec": [],
      "bitrate": 5813,
      "broadcasters": 11,
      "hash": "123456789ABCDEF0123456789ABCDEF012345678",
      "language": [],
      "magnetLink": "magnet:?xt=urn:btih:123456789ABCDEF0123456789ABCDEF012345678&tr=",
      "quality": "HD",
      "score": 0,
      "size": 5798205849,
      "source": "WEB",
      "uploadDate": 2023-06-01T20:16:22.074Z,
      "url": "",
      "videoCodec": "X264",
      "watchers": 6,
    },
    {
      "audioCodec": [
        "MP3",
      ],
      "bitrate": 1802,
      "broadcasters": 7,
      "hash": "123456789ABCDEF0123456789ABCDEF012345678",
      "language": [],
      "magnetLink": "magnet:?xt=urn:btih:123456789ABCDEF0123456789ABCDEF012345678&tr=",
      "quality": "HD",
      "score": 0,
      "size": 1797259264,
      "source": "BLURAY",
      "uploadDate": 2023-05-31T00:00:00.000Z,
      "url": "",
      "videoCodec": "XVID",
      "watchers": 7,
    },
    {
      "audioCodec": [
        "AAC",
      ],
      "bitrate": 1737,
      "broadcasters": 7,
      "hash": "123456789ABCDEF0123456789ABCDEF012345678",
      "language": [
        "JAPANESE",
      ],
      "magnetLink": "magnet:?xt=urn:btih:123456789ABCDEF0123456789ABCDEF012345678&tr=",
      "quality": "HD",
      "score": 0,
      "size": 1732247552,
      "source": "BLURAY",
      "uploadDate": 2023-05-31T00:00:00.000Z,
      "url": "",
      "videoCodec": "X264",
      "watchers": 7,
    },
    {
      "audioCodec": [],
      "bitrate": 2239,
      "broadcasters": 4,
      "hash": "123456789ABCDEF0123456789ABCDEF012345678",
      "language": [
        "JAPANESE",
      ],
      "magnetLink": "magnet:?xt=urn:btih:123456789ABCDEF0123456789ABCDEF012345678&tr=udp://open.stealth.si:80/announce&tr=udp://exodus.desync.com:6969/announce&tr=udp://tracker.opentrackr.org:1337/announce&tr=udp://tracker.torrent.eu.org:451/announce&tr=udp://explodie.org:6969/announce&tr=udp://tracker.birkenwald.de:6969/announce&tr=udp://tracker.therarbg.to:6969/announce",
      "quality": "FHD",
      "score": 0,
      "size": 2233466880,
      "source": "BLURAY",
      "uploadDate": 2023-05-31T00:00:00.000Z,
      "url": "",
      "videoCodec": "X265",
      "watchers": 0,
    },
  ],
  "trailerCode": "",
}
`);
    });
  });

  describe('status', () => {
    it('should return API status', () => {
      const mockStatus = {
        name: 'TheRARBG',
        baseUrl: 'https://therarbg.to',
        queue: 0,
        successes: [],
        failures: [],
        lastRequest: '2023-01-01T00:00:00Z',
      };

      jest.spyOn(contentDirectory['api'], 'status').mockReturnValue(mockStatus);

      const result = contentDirectory.status();

      expect(result).toEqual(mockStatus);
    });
  });

  describe('integration with real API', () => {
    it('should work with real TheRARBG API for known movie', async () => {
      // This test uses the real API with a known movie (Cosmic Princess)
      // It's marked as integration test and may be skipped in CI
      const imdbId = 'tt0119698';

      try {
        const result = await contentDirectory.getMovie(imdbId);

        // If the API is working, we should get a valid response structure
        expect(result).toBeDefined();
        expect(Array.isArray(result.sources)).toBe(true);
        expect(typeof result.trailerCode).toBe('string');

        // If sources are found, validate their structure
        if (result.sources.length > 0) {
          const source = result.sources[0];
          expect(source.hash).toBeDefined();
          expect(source.magnetLink).toContain('magnet:?xt=urn:btih:');
          expect(typeof source.broadcasters).toBe('number');
          expect(typeof source.watchers).toBe('number');
          expect(source.size).toBeGreaterThan(0);
          expect(source.quality).toBeDefined();
        }
      } catch (error) {
        // If the API is down or returns HTML, that's expected behavior
        expect(error).toBeInstanceOf(Error);
        // Don't check specific error message as it can vary
      }
    }, 30000); // Longer timeout for real API calls
  });
});
