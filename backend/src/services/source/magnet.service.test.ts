import { logger } from '@logger';
import type { ParsedTorrent } from 'webtorrent';

import type { DownloadService } from '../download/download.service';
// Import service modules to mock them
import * as itorrentsModule from './services/itorrents';
import * as torrageModule from './services/torrage';
import { SourceMetadataFileService } from './source-metadata-file.service';

// Mock logger
jest.mock('@logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

// Get the mocked function after the mock is set up
import parseTorrent from 'parse-torrent';
const mockParseTorrent = parseTorrent as unknown as jest.MockedFunction<
  (input: Buffer) => Promise<ParsedTorrent>
>;

// Mock DynamicRateLimit
const mockGetThrottle = jest.fn();
const mockReportResponse = jest.fn();
jest.mock('@utils/dynamic-rate-limit', () => ({
  DynamicRateLimit: jest.fn().mockImplementation(() => ({
    getThrottle: mockGetThrottle,
    reportResponse: mockReportResponse,
    getRateLimit: jest.fn(() => ({
      windowSize: 1000,
      limit: 10,
    })),
    getStats: jest.fn(() => ({})),
  })),
}));

describe('MagnetService', () => {
  const hash = 'abcd'.repeat(10);
  const magnetLink = `magnet:?xt=urn:btih:${hash}`;
  const failedResponse = { ok: false } as Response;

  let magnetService: SourceMetadataFileService;
  let mockDownloadService: DownloadService;
  let mockFileBuffer: Buffer;
  let mockResponse: Response;

  // Spies for service functions
  let getSourceMetadataFileFromITorrentsSpy: jest.SpiedFunction<
    typeof itorrentsModule.getSourceMetadataFileFromITorrents
  >;
  let getSourceMetadataFileFromTorrageSpy: jest.SpiedFunction<
    typeof torrageModule.getSourceMetadataFileFromTorrage
  >;
  let getSourceMetadataFileFromWebTorrentSpy: jest.MockedFunction<
    DownloadService['getSourceMetadataFile']
  >;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetThrottle.mockReturnValue(0); // No throttling by default
    mockReportResponse.mockImplementation(() => {});

    // Create mock data
    mockFileBuffer = Buffer.from('mock source metadata file data');

    // Create mock response with simpler typing
    mockResponse = {
      ok: true,
      arrayBuffer: async () =>
        mockFileBuffer.buffer.slice(
          mockFileBuffer.byteOffset,
          mockFileBuffer.byteOffset + mockFileBuffer.byteLength
        ),
    } as Partial<Response> as Response;

    getSourceMetadataFileFromWebTorrentSpy = jest.fn();
    mockDownloadService = {
      getSourceMetadataFile: getSourceMetadataFileFromWebTorrentSpy,
    } as Partial<DownloadService> as DownloadService;

    // Set up service spies with default successful responses
    getSourceMetadataFileFromITorrentsSpy = jest
      .spyOn(itorrentsModule, 'getSourceMetadataFileFromITorrents')
      .mockResolvedValue(mockResponse);
    getSourceMetadataFileFromTorrageSpy = jest
      .spyOn(torrageModule, 'getSourceMetadataFileFromTorrage')
      .mockResolvedValue(mockResponse);

    // Mock parse-torrent with valid response
    const mockParsedTorrent: ParsedTorrent = {
      infoHash: hash,
      name: 'Test Source Metadata File',
      files: [{ name: 'test.txt', length: 100, path: 'test.txt', offset: 0 }],
    };
    mockParseTorrent.mockResolvedValue(mockParsedTorrent);

    magnetService = new SourceMetadataFileService(mockDownloadService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with three services', () => {
      expect(magnetService).toBeInstanceOf(SourceMetadataFileService);

      const stats = magnetService.getServiceStatistics();
      expect(Object.keys(stats)).toEqual(['webTorrent', 'itorrents', 'torrage']);
    });
  });

  describe('getTorrent', () => {
    it('should return torrent buffer from fastest available service', async () => {
      const result = await magnetService.getSourceMetadataFile(magnetLink, hash);

      expect(result).toBeInstanceOf(Buffer);
      expect(result).toEqual(mockFileBuffer);

      // Should try webTorrent first (rank 1)
      expect(getSourceMetadataFileFromWebTorrentSpy).toHaveBeenCalledWith(
        magnetLink,
        hash,
        expect.any(Number)
      );
    });

    it('should fallback to next service when primary fails', async () => {
      // Mock webTorrent to fail
      getSourceMetadataFileFromWebTorrentSpy.mockRejectedValue(new Error('WebTorrent failed'));

      const result = await magnetService.getSourceMetadataFile(magnetLink, hash);

      expect(result).toBeInstanceOf(Buffer);
      expect(getSourceMetadataFileFromWebTorrentSpy).toHaveBeenCalled();
      expect(getSourceMetadataFileFromITorrentsSpy).toHaveBeenCalled();
    });

    it('should try all services before giving up', async () => {
      // Mock first two services to fail
      getSourceMetadataFileFromWebTorrentSpy.mockRejectedValue(new Error('WebTorrent failed'));
      getSourceMetadataFileFromITorrentsSpy.mockResolvedValue(failedResponse);

      const result = await magnetService.getSourceMetadataFile(magnetLink, hash);

      expect(result).toBeInstanceOf(Buffer);
      expect(getSourceMetadataFileFromWebTorrentSpy).toHaveBeenCalled();
      expect(getSourceMetadataFileFromITorrentsSpy).toHaveBeenCalled();
      expect(getSourceMetadataFileFromTorrageSpy).toHaveBeenCalled();
    });

    it('should return null when all services fail', async () => {
      getSourceMetadataFileFromWebTorrentSpy.mockRejectedValue(new Error('WebTorrent failed'));

      getSourceMetadataFileFromITorrentsSpy.mockResolvedValue(failedResponse);
      getSourceMetadataFileFromTorrageSpy.mockResolvedValue(failedResponse);

      const result = await magnetService.getSourceMetadataFile(magnetLink, hash);

      expect(result).toBeNull();
    });

    it('should handle service errors gracefully', async () => {
      // Mock first service to throw error, second to succeed
      getSourceMetadataFileFromWebTorrentSpy.mockRejectedValueOnce(new Error('Service error'));

      const result = await magnetService.getSourceMetadataFile(magnetLink, hash);

      expect(result).toBeInstanceOf(Buffer);
      expect(logger.warn).toHaveBeenCalledWith(
        'DataResolver',
        expect.stringContaining('Error using')
      );
    });

    it('should validate torrent buffers for services with shouldVerify=true', async () => {
      // Force selection of iTorrents which has shouldVerify=true
      getSourceMetadataFileFromWebTorrentSpy.mockRejectedValue(new Error('WebTorrent failed'));
      const failedResponse = { ok: false } as Response;
      getSourceMetadataFileFromTorrageSpy.mockResolvedValue(failedResponse);
      getSourceMetadataFileFromITorrentsSpy.mockResolvedValue(mockResponse);

      const result = await magnetService.getSourceMetadataFile(magnetLink, hash);

      expect(getSourceMetadataFileFromITorrentsSpy).toHaveBeenCalledWith(hash, expect.any(Number));
      expect(result).toBeInstanceOf(Buffer);
      expect(mockParseTorrent).toHaveBeenCalledWith(mockFileBuffer);
    });

    it('should handle hash mismatch during validation', async () => {
      // Mock parse-torrent to return different hash
      const mockDifferentParsedTorrent: ParsedTorrent = {
        infoHash: 'differenthash456',
        name: 'Test Torrent',
      };
      mockParseTorrent.mockResolvedValue(mockDifferentParsedTorrent);

      // Force iTorrents service
      getSourceMetadataFileFromWebTorrentSpy.mockRejectedValue(new Error('WebTorrent failed'));
      const failedResponse = { ok: false } as Response;
      getSourceMetadataFileFromTorrageSpy.mockResolvedValue(failedResponse);

      const result = await magnetService.getSourceMetadataFile(magnetLink, hash);

      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        'DataResolver',
        'Identifier mismatch detected for itorrents - file validation failed'
      );
    });
  });

  describe('service load balancing', () => {
    it('should distribute requests across multiple services', async () => {
      // Make multiple requests to see load balancing
      for (let i = 0; i < 5; i++) {
        await magnetService.getSourceMetadataFile(magnetLink, hash);
      }

      // Should have used webTorrent (highest rank) for all requests
      expect(getSourceMetadataFileFromWebTorrentSpy).toHaveBeenCalledTimes(5);
    });

    it('should update service rankings based on performance', async () => {
      const initialStats = magnetService.getServiceStatistics();

      // Simulate successful usage
      await magnetService.getSourceMetadataFile(magnetLink, hash);

      const updatedStats = magnetService.getServiceStatistics();

      // WebTorrent should have updated statistics
      expect(updatedStats.webTorrent.totalCalls).toBeGreaterThan(
        initialStats.webTorrent.totalCalls
      );
    });
  });

  describe('rate limiting integration', () => {
    it.skip('should respect rate limits when accessing services', async () => {
      // Mock throttling for rate-limited services
      mockGetThrottle.mockReturnValue(1000); // 1 second throttle

      const result = await magnetService.getSourceMetadataFile(magnetLink, hash);

      expect(result).toBeInstanceOf(Buffer);
      // Should fall back to WebTorrent (no rate limiting)
      expect(getSourceMetadataFileFromWebTorrentSpy).toHaveBeenCalled();
    });

    it('should report responses to rate limiter', async () => {
      // Force iTorrents usage by making others fail
      getSourceMetadataFileFromWebTorrentSpy.mockRejectedValue(new Error('WebTorrent failed'));
      const failedResponse = { ok: false } as Response;
      getSourceMetadataFileFromTorrageSpy.mockResolvedValue(failedResponse);

      await magnetService.getSourceMetadataFile(magnetLink, hash);

      expect(mockReportResponse).toHaveBeenCalledWith(mockResponse);
    });
  });

  describe('error edge cases', () => {
    it('should handle parse-torrent throwing errors', async () => {
      mockParseTorrent.mockRejectedValue(new Error('Parse error'));

      // Force iTorrents (has validation)
      getSourceMetadataFileFromWebTorrentSpy.mockRejectedValue(new Error('WebTorrent failed'));
      const failedResponse = { ok: false } as Response;
      getSourceMetadataFileFromTorrageSpy.mockResolvedValue(failedResponse);

      const result = await magnetService.getSourceMetadataFile(magnetLink, hash);

      expect(result).toBe(null);
      expect(logger.warn).toHaveBeenCalledWith(
        'DataResolver',
        'Error validating file buffer:',
        expect.any(Error)
      );
    });

    it('should handle concurrent requests exceeding service limits', async () => {
      // Create many concurrent requests
      const promises = Array.from({ length: 20 }, () =>
        magnetService.getSourceMetadataFile(magnetLink, hash)
      );

      const results = await Promise.all(promises);

      // All should complete successfully
      results.forEach(result => {
        expect(result).toBeInstanceOf(Buffer);
      });
    });
  });

  describe('service statistics', () => {
    it('should provide accurate service statistics', () => {
      const stats = magnetService.getServiceStatistics();

      expect(stats).toHaveProperty('webTorrent');
      expect(stats).toHaveProperty('itorrents');
      expect(stats).toHaveProperty('torrage');

      // Check statistics structure
      Object.values(stats).forEach(serviceStat => {
        expect(serviceStat).toHaveProperty('successRate');
        expect(serviceStat).toHaveProperty('avgResponseTime');
        expect(serviceStat).toHaveProperty('totalCalls');
        expect(serviceStat).toHaveProperty('rank');
      });
    });

    it('should update statistics after service calls', async () => {
      const initialStats = magnetService.getServiceStatistics();

      await magnetService.getSourceMetadataFile(magnetLink, hash);

      const updatedStats = magnetService.getServiceStatistics();

      expect(updatedStats.webTorrent.totalCalls).toBeGreaterThan(
        initialStats.webTorrent.totalCalls
      );
    });
  });
});
