import { RequestService } from '@services/request/request.service';
import { StatsService } from '@services/stats/stats.service';

import { getSourceMetadataFileFromTorrage } from './torrage';

jest.mock('@services/request/request.service');

describe('Torrage service', () => {
  let mockRequestService: jest.Mocked<RequestService>;

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(1748088913000);
  });

  beforeEach(() => {
    mockRequestService = new RequestService(new StatsService()) as jest.Mocked<RequestService>;
  });

  it('should fetch a source metadata file from Torrage', async () => {
    const hash = 'c9e15763f722f23e98a29decdfae341b98d53056'; // Cosmos Laundromat
    mockRequestService.request.mockResolvedValue({
      body: 'mock torrent data',
      headers: { 'content-type': 'application/x-bittorrent' },
      ok: true,
      status: 200,
      statusText: 'OK',
    });

    const sourceMetadataFile = await getSourceMetadataFileFromTorrage(
      hash,
      100,
      mockRequestService
    );
    expect(sourceMetadataFile.status).toBe(200);
    expect(sourceMetadataFile.headers['content-type']).toBe('application/x-bittorrent');
  });

  it('should return null for a missing hash', async () => {
    const missingHash = 'c9e15763f722f23e98a29decdfae341b98d53057';
    mockRequestService.request.mockResolvedValue({
      body: 'Not found',
      headers: {},
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    const sourceMetadataFile = await getSourceMetadataFileFromTorrage(
      missingHash,
      100,
      mockRequestService
    );
    expect(sourceMetadataFile.status).toBe(404);
    expect(sourceMetadataFile.status >= 200 && sourceMetadataFile.status < 300).toBeFalsy();
  });
});
