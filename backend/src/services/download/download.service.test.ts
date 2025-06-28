import { logger } from '@logger';
import { Client as BTClient } from 'bittorrent-tracker';
import loadIPSet from 'load-ip-set';

import { ENV } from '@constants';
import { enhancedFetch } from '@utils/fetch.util';

import { mockedTorrentInstance } from '../../__mocks__/webtorrent';
import { DownloadService } from './download.service';

// Mock all external dependencies
jest.mock('@constants');
jest.mock('@utils/fetch.util');
jest.mock('bittorrent-tracker');
jest.mock('load-ip-set');
jest.mock('@logger');

describe('DownloadService', () => {
  let service: DownloadService;
  let mockBTClient: jest.Mocked<BTClient>;
  let mockEnhancedFetch: jest.MockedFunction<typeof enhancedFetch>;
  let mockLoadIPSet: jest.MockedFunction<typeof loadIPSet>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock ENV function
    (ENV as jest.MockedFunction<typeof ENV>).mockImplementation((key: string) => {
      const envMock: Record<string, string[] | boolean | number | string> = {
        CONTENT_CONNECTION_LIMIT: 100,
        CONTENT_DOWNLOAD_LIMIT: 1000000,
        CONTENT_UPLOAD_LIMIT: 500000,
        DISABLE_DISCOVERY: false,
        STATIC_TRACKERS: ['udp://tracker1.example.com:1337', 'udp://tracker2.example.com:1337'],
        BEST_TRACKERS_DOWNLOAD_URL: 'https://example.com/trackers_best.txt',
        BLACKLISTED_TRACKERS_DOWNLOAD_URL: 'https://example.com/blacklist.txt',
      };
      return envMock[key];
    });

    // Mock BT Client
    mockBTClient = {
      once: jest.fn(),
      scrape: jest.fn(),
      destroy: jest.fn(),
    } as unknown as jest.Mocked<BTClient>;

    (BTClient as jest.MockedClass<typeof BTClient>).mockImplementation(() => mockBTClient);

    // Mock enhanced fetch
    mockEnhancedFetch = enhancedFetch as jest.MockedFunction<typeof enhancedFetch>;

    // Mock loadIPSet
    mockLoadIPSet = loadIPSet as jest.MockedFunction<typeof loadIPSet>;
  });

  describe('tracker loading', () => {
    beforeEach(() => {
      // Mock successful tracker fetch
      mockEnhancedFetch.mockResolvedValue(
        new Response(
          'udp://tracker1.example.com:1337\nudp://tracker2.example.com:1337\n# comment\n',
          {
            status: 200,
          }
        )
      );
    });

    it('should load trackers and IP sets on initialization', async () => {
      service = new DownloadService();

      // Wait for async initialization
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockEnhancedFetch).toHaveBeenCalledWith('https://example.com/trackers_best.txt');
      expect(mockLoadIPSet).toHaveBeenCalledWith(
        'https://example.com/blacklist.txt',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should handle tracker fetch errors gracefully', async () => {
      mockEnhancedFetch.mockRejectedValue(new Error('Network error'));

      service = new DownloadService();

      // Wait for async initialization
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(logger.error).toHaveBeenCalledWith(
        'DownloadService',
        'Error fetching trackers:',
        expect.any(Error)
      );
    });

    it('should handle IP set loading errors gracefully', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockLoadIPSet as any).mockImplementation(
        (url: string, options: unknown, callback: (err: Error | null, ipSet: unknown) => void) => {
          callback(new Error('IP set error'), null);
        }
      );

      service = new DownloadService();

      // Wait for async initialization
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(logger.error).toHaveBeenCalledWith(
        'DownloadService',
        'Error loading IP set:',
        expect.any(Error)
      );
    });
  });

  describe('generateLink', () => {
    beforeEach(() => {
      mockEnhancedFetch.mockResolvedValue(
        new Response('udp://tracker2.example.com:1337\nudp://tracker3.example.com:1337', {
          status: 200,
        })
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockLoadIPSet as any).mockImplementation(
        (url: string, options: unknown, callback: (err: Error | null, ipSet: unknown) => void) => {
          callback(null, { contains: jest.fn() });
        }
      );

      service = new DownloadService();
    });

    it('should generate a valid magnet link', () => {
      const hash = 'abcdef1234567890abcdef1234567890abcdef12';
      const trackers = ['udp://tracker5.example.com:1337'];
      const name = 'Test Movie';

      const result = service.generateLink(hash, trackers, name);

      expect(result).toMatchInlineSnapshot(
        `"magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12&tr=udp%3A%2F%2Ftracker5.example.com%3A1337%2Cudp%3A%2F%2Ftracker2.example.com%3A1337%2Cudp%3A%2F%2Ftracker3.example.com%3A1337%2Cudp%3A%2F%2Ftracker1.example.com%3A1337&dn=Test+Movie"`
      );
      expect(result).toContain('dn=Test+Movie'); // URL encoding uses + for spaces
      expect(result).toContain('tr=udp%3A%2F%2Ftracker5.example.com%3A1337');
    });

    it('should handle empty trackers array', () => {
      const hash = 'abcdef1234567890abcdef1234567890abcdef12';
      const trackers: string[] = [];

      const result = service.generateLink(hash, trackers);

      expect(result).toMatchInlineSnapshot(
        `"magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12&tr=udp%3A%2F%2Ftracker2.example.com%3A1337%2Cudp%3A%2F%2Ftracker3.example.com%3A1337%2Cudp%3A%2F%2Ftracker1.example.com%3A1337&dn="`
      );
    });

    it('should deduplicate trackers', () => {
      const hash = 'abcdef1234567890abcdef1234567890abcdef12';
      const trackers = ['udp://tracker4.example.com:1337', 'udp://tracker4.example.com:1337'];

      const result = service.generateLink(hash, trackers);

      expect(result).toMatchInlineSnapshot(
        `"magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12&tr=udp%3A%2F%2Ftracker4.example.com%3A1337%2Cudp%3A%2F%2Ftracker2.example.com%3A1337%2Cudp%3A%2F%2Ftracker3.example.com%3A1337%2Cudp%3A%2F%2Ftracker1.example.com%3A1337&dn="`
      );
    });
  });

  //   describe('getSourceMetadataFile', () => {
  //     beforeEach(() => {
  //       mockEnhancedFetch.mockResolvedValue(
  //         new Response('udp://tracker1.example.com:1337', {
  //           status: 200,
  //         })
  //       );

  //       mockLoadIPSet.mockImplementation((url: LoadIPSetInput, callback: LoadIPSetCallback) => {
  //         callback(null, { contains: jest.fn() });
  //       });

  //       service = new DownloadService();
  //     });

  //     it('should successfully get source metadata file', async () => {
  //       const sourceLink = 'magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12';
  //       const hash = 'abcdef1234567890abcdef1234567890abcdef12';
  //       const mockTorrentFile = Buffer.from('torrent file content');

  //       mockMagnet.mockReturnValue({ infoHash: hash });
  //       mockWebTorrentClient.add.mockImplementation(
  //         (magnetLink: string, callback: ((torrent: Torrent) => void) | undefined) => {
  //           const mockTorrent = { torrentFile: mockTorrentFile } as Torrent;
  //           callback?.(mockTorrent);
  //           return mockTorrent;
  //         }
  //       );

  //       const result = await service.getSourceMetadataFile(sourceLink, hash, 5000);

  //       expect(result).toBe(mockTorrentFile);
  //       expect(mockWebTorrentClient.add).toHaveBeenCalledWith(
  //         sourceLink,
  //         { deselect: true, destroyStoreOnDestroy: true, skipVerify: true },
  //         expect.any(Function)
  //       );
  //     });

  //     it('should handle existing torrent in client', async () => {
  //       const sourceLink = 'magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12';
  //       const hash = 'abcdef1234567890abcdef1234567890abcdef12';
  //       const mockTorrentFile = Buffer.from('existing torrent file content');

  //       mockMagnet.mockReturnValue({ infoHash: hash });
  //       mockWebTorrentClient.torrents = [{ infoHash: hash, torrentFile: mockTorrentFile } as Torrent];

  //       const result = await service.getSourceMetadataFile(sourceLink, hash, 5000);

  //       expect(result).toBe(mockTorrentFile);
  //       expect(mockWebTorrentClient.add).not.toHaveBeenCalled();
  //     });

  //     it('should correct malformed magnet links', async () => {
  //       const sourceLink = 'magnet:?xt=urn%3Abtih%3Aabcdef1234567890abcdef1234567890abcdef12';
  //       const hash = 'abcdef1234567890abcdef1234567890abcdef12';
  //       const correctedLink = 'magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12';

  //       mockMagnet.mockReturnValue({ infoHash: hash });
  //       mockWebTorrentClient.add.mockImplementation((magnetLink, options, callback) => {
  //         expect(magnetLink).toBe(correctedLink);
  //         const mockTorrent = { torrentFile: Buffer.from('content') };
  //         callback(mockTorrent as any);
  //         return mockTorrent as any;
  //       });

  //       await service.getSourceMetadataFile(sourceLink, hash, 5000);

  //       expect(mockWebTorrentClient.add).toHaveBeenCalledWith(
  //         correctedLink,
  //         expect.any(Object),
  //         expect.any(Function)
  //       );
  //     });

  //     it('should timeout and reject if timeout is reached', async () => {
  //       const sourceLink = 'magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12';
  //       const hash = 'abcdef1234567890abcdef1234567890abcdef12';

  //       mockMagnet.mockReturnValue({ infoHash: hash });
  //       mockWebTorrentClient.add.mockImplementation(() => {
  //         // Don't call the callback to simulate timeout
  //         return {} as any;
  //       });

  //       await expect(service.getSourceMetadataFile(sourceLink, hash, 100)).rejects.toThrow(
  //         'Timeout after 100 ms while adding file'
  //       );
  //     });

  //     it('should reject if magnet link hash does not match', async () => {
  //       const sourceLink = 'magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12';
  //       const hash = 'differenthash1234567890abcdef1234567890abc';

  //       mockMagnet.mockReturnValue({ infoHash: 'abcdef1234567890abcdef1234567890abcdef12' });

  //       await expect(service.getSourceMetadataFile(sourceLink, hash, 5000)).rejects.toThrow(
  //         'Invalid magnet link'
  //       );
  //     });

  //     it('should reject if magnet parsing fails', async () => {
  //       const sourceLink = 'invalid-magnet-link';
  //       const hash = 'abcdef1234567890abcdef1234567890abcdef12';

  //       mockMagnet.mockImplementation(() => {
  //         throw new Error('Invalid magnet link');
  //       });

  //       await expect(service.getSourceMetadataFile(sourceLink, hash, 5000)).rejects.toThrow(
  //         'Error parsing magnet link'
  //       );
  //     });

  //     it('should reject if torrent file is not found', async () => {
  //       const sourceLink = 'magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12';
  //       const hash = 'abcdef1234567890abcdef1234567890abcdef12';

  //       mockMagnet.mockReturnValue({ infoHash: hash });
  //       mockWebTorrentClient.add.mockImplementation((magnetLink, options, callback) => {
  //         const mockTorrent = { torrentFile: null };
  //         callback(mockTorrent as any);
  //         return mockTorrent as any;
  //       });

  //       await expect(service.getSourceMetadataFile(sourceLink, hash, 5000)).rejects.toThrow(
  //         'File not found'
  //       );
  //     });

  //     it('should reject if WebTorrent add throws an error', async () => {
  //       const sourceLink = 'magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12';
  //       const hash = 'abcdef1234567890abcdef1234567890abcdef12';

  //       mockMagnet.mockReturnValue({ infoHash: hash });
  //       mockWebTorrentClient.add.mockImplementation(() => {
  //         throw new Error('WebTorrent error');
  //       });

  //       await expect(service.getSourceMetadataFile(sourceLink, hash, 5000)).rejects.toThrow(
  //         'Error adding file to client'
  //       );
  //     });
  //   });

  //   describe('getStats', () => {
  //     beforeEach(() => {
  //       mockEnhancedFetch.mockResolvedValue({
  //         status: 200,
  //         text: async () => 'udp://tracker1.example.com:1337',
  //       } as any);

  //       mockLoadIPSet.mockImplementation((url, options, callback) => {
  //         callback(null, { contains: jest.fn() } as any);
  //       });

  //       service = new DownloadService();
  //     });

  //     it('should successfully get torrent stats', async () => {
  //       const infoHash = 'abcdef1234567890abcdef1234567890abcdef12';
  //       const mockScrapeData = { complete: 5, incomplete: 3 };

  //       mockBTClient.once.mockImplementation((event, callback) => {
  //         if (event === 'scrape') {
  //           setTimeout(() => callback(mockScrapeData), 0);
  //         }
  //         return mockBTClient;
  //       });

  //       const result = await service.getStats(infoHash);

  //       expect(result).toEqual({
  //         broadcasters: 5,
  //         watchers: 3,
  //       });
  //       expect(BTClient).toHaveBeenCalledWith({
  //         infoHash: infoHash.toLowerCase(),
  //         announce: ['udp://tracker.opentrackr.org:1337'],
  //         peerId: Buffer.from('01234567890123456789'),
  //         port: 6881,
  //       });
  //     });

  //     it('should handle missing complete/incomplete data', async () => {
  //       const infoHash = 'abcdef1234567890abcdef1234567890abcdef12';
  //       const mockScrapeData = {};

  //       mockBTClient.once.mockImplementation((event, callback) => {
  //         if (event === 'scrape') {
  //           setTimeout(() => callback(mockScrapeData), 0);
  //         }
  //         return mockBTClient;
  //       });

  //       const result = await service.getStats(infoHash);

  //       expect(result).toEqual({
  //         broadcasters: 0,
  //         watchers: 0,
  //       });
  //     });

  //     it('should handle scrape errors', async () => {
  //       const infoHash = 'abcdef1234567890abcdef1234567890abcdef12';
  //       const error = new Error('Scrape error');

  //       mockBTClient.once.mockImplementation((event, callback) => {
  //         if (event === 'error') {
  //           setTimeout(() => callback(error), 0);
  //         }
  //         return mockBTClient;
  //       });

  //       await expect(service.getStats(infoHash)).rejects.toThrow('Scrape error');
  //     });

  //     it('should handle scrape timeout', async () => {
  //       const infoHash = 'abcdef1234567890abcdef1234567890abcdef12';

  //       mockBTClient.once.mockImplementation(() => {
  //         // Don't call any callbacks to simulate timeout
  //         return mockBTClient;
  //       });

  //       await expect(service.getStats(infoHash)).rejects.toThrow(
  //         expect.objectContaining({
  //           message: expect.stringContaining('Scrape request timed out'),
  //         })
  //       );
  //     }, 10000);

  //     it('should destroy client on success', async () => {
  //       const infoHash = 'abcdef1234567890abcdef1234567890abcdef12';
  //       const mockScrapeData = { complete: 1, incomplete: 2 };

  //       mockBTClient.once.mockImplementation((event, callback) => {
  //         if (event === 'scrape') {
  //           setTimeout(() => callback(mockScrapeData), 0);
  //         }
  //         return mockBTClient;
  //       });

  //       await service.getStats(infoHash);

  //       expect(mockBTClient.destroy).toHaveBeenCalled();
  //     });

  //     it('should destroy client on error', async () => {
  //       const infoHash = 'abcdef1234567890abcdef1234567890abcdef12';
  //       const error = new Error('Scrape error');

  //       mockBTClient.once.mockImplementation((event, callback) => {
  //         if (event === 'error') {
  //           setTimeout(() => callback(error), 0);
  //         }
  //         return mockBTClient;
  //       });

  //       try {
  //         await service.getStats(infoHash);
  //       } catch (e) {
  //         // Expected to throw
  //       }

  //       expect(mockBTClient.destroy).toHaveBeenCalled();
  //     });
  //   });

  describe('error handling', () => {
    it('should log WebTorrent client errors', () => {
      service = new DownloadService();

      // Get the error handler that was registered
      const errorHandler = mockedTorrentInstance.on.mock.calls.find(call => call[0] === 'error')[1];

      const testError = new Error('Test WebTorrent error');
      errorHandler(testError);

      expect(logger.error).toHaveBeenCalledWith(
        'DownloadService',
        'Error:',
        'Test WebTorrent error',
        testError
      );
    });
  });
});
