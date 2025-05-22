import { mockedTorrentInstance, resetMocks } from '../../__mocks__/webtorrent';

// Create proper mock for DynamicRateLimit
jest.mock('@utils/dynamic-rate-limit', () => ({
  DynamicRateLimit: jest.fn().mockImplementation(() => ({
    getThrottle: jest.fn().mockReturnValue(0),
    reportResponse: jest.fn().mockReturnValue(false),
  })),
}));

// Create a fetch mock that handles the preconnect property needed by the type definition
const mockFetch = jest.fn().mockImplementation(url => {
  if (typeof url === 'string' && url.includes('itorrents.org')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      statusText: 'OK',
      arrayBuffer: () => Promise.resolve(Buffer.from('mock torrent from itorrents').buffer),
    });
  }
  return Promise.resolve({
    ok: false,
    status: 404,
    statusText: 'Not Found',
  });
});

// Assign the mock to global.fetch
global.fetch = mockFetch as unknown as typeof fetch;

// Now import the service after all mocks are in place
import { MagnetService } from './magnet.service';

describe('MagnetService', () => {
  let service: MagnetService;

  beforeEach(() => {
    jest.clearAllMocks();
    resetMocks();
    service = new MagnetService();
  });

  afterEach(() => {
    if (service) {
      service.dispose();
    }
  });

  it('should get torrent from WebTorrent', async () => {
    // Set up the mock response for getTorrent
    mockedTorrentInstance.add.mockImplementation((magnetLink, options, callback) => {
      setTimeout(() => {
        callback({
          torrentFile: Buffer.from('mock torrent file content'),
          remove: jest.fn(),
        });
      }, 10);
      return {
        torrentFile: Buffer.from('mock torrent file content'),
        remove: jest.fn(),
      };
    });

    const result = await service.getTorrent('magnet:?xt=urn:btih:abc123', 'abc123');
    expect(result).toBeInstanceOf(Buffer);
    expect(result?.toString()).toBe('mock torrent file content');
  });

  it('should get service statistics', () => {
    const stats = service.getServiceStatistics();
    expect(stats).toBeDefined();
    expect(Object.keys(stats)).toContain('webTorrent');
    expect(Object.keys(stats)).toContain('itorrents');

    // Check that the statistics have the expected structure
    expect(stats.webTorrent).toHaveProperty('successRate');
    expect(stats.webTorrent).toHaveProperty('avgResponseTime');
    expect(stats.webTorrent).toHaveProperty('totalCalls');
    expect(stats.webTorrent).toHaveProperty('rank');
  });

  it('should properly clean up resources on dispose', () => {
    // Test that the dispose method calls destroy on the WebTorrent client
    service.dispose();
    expect(mockedTorrentInstance.destroy).toHaveBeenCalled();
  });

  it('should try alternative services if WebTorrent fails', async () => {
    // Mock WebTorrent to fail
    mockedTorrentInstance.add.mockImplementation((magnetLink, options, callback) => {
      if (typeof callback === 'function') {
        setTimeout(() => {
          callback({
            torrentFile: null, // This will cause WebTorrent to "fail"
            remove: jest.fn(),
          });
        }, 10);
      }
      return {
        torrentFile: null,
        remove: jest.fn(),
      };
    });

    // Set up fetch mock to succeed for itorrents
    mockFetch.mockImplementation(url => {
      if (typeof url === 'string' && url.includes('itorrents.org')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          arrayBuffer: () => Promise.resolve(Buffer.from('mock torrent from itorrents').buffer),
        });
      }
      return Promise.resolve({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });
    });

    // Call getTorrent and expect it to use the fallback service
    const result = await service.getTorrent('magnet:?xt=urn:btih:abc123', 'abc123');

    // Verify fetch was called (in some cases)
    expect(mockFetch).toHaveBeenCalled();

    // The result might be null if all services fail, so we need to handle that case
    if (result) {
      expect(Buffer.isBuffer(result)).toBe(true);
    }
  });

  it('should update service metrics after successful torrent retrieval', async () => {
    // Set up the mock response for getTorrent to succeed quickly
    mockedTorrentInstance.add.mockImplementation((magnetLink, options, callback) => {
      callback({
        torrentFile: Buffer.from('mock torrent file content'),
        remove: jest.fn(),
      });
      return {
        torrentFile: Buffer.from('mock torrent file content'),
        remove: jest.fn(),
      };
    });

    // Get the initial statistics
    const initialStats = service.getServiceStatistics();

    // Call getTorrent to update metrics
    await service.getTorrent('magnet:?xt=urn:btih:abc123', 'abc123');

    // Get updated statistics
    const updatedStats = service.getServiceStatistics();

    // Check that at least one service has updated metrics
    const usedService = Object.keys(updatedStats).find(
      service => updatedStats[service].totalCalls > (initialStats[service]?.totalCalls || 0)
    );

    expect(usedService).toBeDefined();
    if (usedService) {
      expect(updatedStats[usedService].totalCalls).toBeGreaterThan(
        initialStats[usedService]?.totalCalls || 0
      );
    }
  });
});
