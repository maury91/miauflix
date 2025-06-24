import { getSourceMetadataFileFromTorrage } from './torrage';

describe('Torrage service', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(1748088913000);
  });
  it('should fetch a source metadata file from Torrage', async () => {
    const hash = 'c9e15763f722f23e98a29decdfae341b98d53056'; // Cosmos Laundromat
    const sourceMetadataFile = await getSourceMetadataFileFromTorrage(hash, 100);
    expect(sourceMetadataFile.ok).toBeTruthy();
    expect(sourceMetadataFile.headers.get('content-type')).toBe('application/x-bittorrent');
    const text = await sourceMetadataFile.text();
    expect(text).toContain('d8:announce');
  });

  it('should return null for a missing hash', async () => {
    const missingHash = 'c9e15763f722f23e98a29decdfae341b98d53057';
    const sourceMetadataFile = await getSourceMetadataFileFromTorrage(missingHash, 100);
    expect(sourceMetadataFile.ok).toBeFalsy();
    expect(sourceMetadataFile.status).toBe(404);
  });
});
