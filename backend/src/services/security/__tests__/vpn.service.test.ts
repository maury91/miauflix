import { ConfigurationService } from '@services/configuration/configuration.service';

import { VpnDetectionService } from '../vpn.service';

jest.mock('@services/configuration/configuration.service');

// Mock the fetch function
global.fetch = jest.fn();

const createMockConfig = (): ConfigurationService => {
  const mockedConfigService =
    new ConfigurationService() as unknown as jest.Mocked<ConfigurationService>;
  mockedConfigService.get.mockImplementation((key: string) => {
    if (key === 'DISABLE_VPN_CHECK') return false as never;
    return undefined as never;
  });
  return mockedConfigService;
};

describe('VpnDetectionService', () => {
  let vpnService: VpnDetectionService;
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    vpnService = new VpnDetectionService(createMockConfig(), 1000);
  });

  afterEach(() => {
    // Clean up any intervals
    const interval = vpnService['monitoringInterval'];
    if (interval) {
      clearInterval(interval);
    }
  });

  describe('IP Provider Fallbacks', () => {
    it('should try multiple providers when first one fails', async () => {
      // Mock first provider (ipify) to fail
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          json: jest.fn(),
        } as unknown as Response)
        // Mock second provider (ipinfo.io) to succeed
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({ ip: '192.168.1.1' }),
        } as unknown as Response);

      const ip = await vpnService['getIpAddress']();

      expect(ip).toBe('192.168.1.1');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should cycle through all providers before giving up', async () => {
      // Mock all providers to fail
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: jest.fn(),
      } as unknown as Response);

      await expect(vpnService['getIpAddress']()).rejects.toThrow('All IP providers failed');

      // Should have tried all 6 providers
      expect(mockFetch).toHaveBeenCalledTimes(6);
    });

    it('should validate IP addresses and reject invalid ones', async () => {
      // Mock provider to return invalid IP
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({ ip: 'invalid-ip' }),
        } as unknown as Response)
        // Mock second provider to return valid IP
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({ ip: '192.168.1.1' }),
        } as unknown as Response);

      const ip = await vpnService['getIpAddress']();

      expect(ip).toBe('192.168.1.1');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should handle timeout errors', async () => {
      jest.useFakeTimers();
      // Mock provider to timeout
      mockFetch
        .mockImplementationOnce(
          () => new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 100))
        )
        // Mock second provider to succeed
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({ ip: '192.168.1.1' }),
        } as unknown as Response);

      const ipPromise = vpnService['getIpAddress']();
      jest.advanceTimersByTime(200); // Fast-forward time to trigger timeout
      const ip = await ipPromise;

      expect(ip).toBe('192.168.1.1');
    });
  });
});
