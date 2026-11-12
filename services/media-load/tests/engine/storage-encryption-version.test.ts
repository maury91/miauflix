import type { EncryptedStorageLayout } from '../../src/storage/types';
import { mockEngineModules } from '../helpers/engine';

mockEngineModules();

const { storageEncryptionVersion, storeEncryptionOptions } = await import(
  '../../src/engine/download.service'
);
const { randomStorageLocation } = await import('../../src/engine/download/layout');

const layout = (encryptionVersion?: 1 | 2): EncryptedStorageLayout => ({
  storeName: 'movie - abcdef12',
  filenameSalt: 'download-abcdef12',
  pieceLength: 16,
  files: [{ path: 'movie.mkv', length: 16, offset: 0 }],
  ...(encryptionVersion ? { encryptionVersion } : {}),
});

describe('storageEncryptionVersion', () => {
  it('reads a saved layout without a version as v1, the format before versions', () => {
    expect(
      storageEncryptionVersion({ encryptedLayout: layout(), downloadedPieces: new Uint8Array(0) })
    ).toBe(1);
  });

  it('keeps the version a saved layout records', () => {
    expect(
      storageEncryptionVersion({
        encryptedLayout: layout(2),
        downloadedPieces: new Uint8Array([0xff]),
      })
    ).toBe(2);
  });

  it('treats verified pieces without a layout as old v1 data', () => {
    expect(
      storageEncryptionVersion({ encryptedLayout: null, downloadedPieces: new Uint8Array([0, 4]) })
    ).toBe(1);
  });

  it('starts storage with nothing on it at the current version', () => {
    expect(
      storageEncryptionVersion({ encryptedLayout: null, downloadedPieces: new Uint8Array(2) })
    ).toBe(2);
  });
});

describe('storeEncryptionOptions', () => {
  const HASH = 'ABCDEF0123456789';

  it('opens a v1 store with the name salt derived from the source hash', () => {
    expect(
      storeEncryptionOptions(
        { encryptedLayout: layout(), downloadedPieces: new Uint8Array([1]) },
        HASH
      )
    ).toEqual({ encryptionVersion: 1, filenameSalt: `download-${HASH}` });
  });

  it('reopens a v2 store with the salts its layout saved', () => {
    const saved = { ...layout(2), filenameSalt: 'name-salt', contentSalt: 'content-salt' };
    expect(
      storeEncryptionOptions({ encryptedLayout: saved, downloadedPieces: new Uint8Array(0) }, HASH)
    ).toEqual({ encryptionVersion: 2, filenameSalt: 'name-salt', contentSalt: 'content-salt' });
  });

  it('refuses a v2 layout without its content salt rather than guess', () => {
    expect(() =>
      storeEncryptionOptions(
        { encryptedLayout: layout(2), downloadedPieces: new Uint8Array(0) },
        HASH
      )
    ).toThrow('Encrypted layout is missing its content salt');
  });

  it('gives a new store two fresh random salts, unrelated to the source hash', () => {
    const fresh = () =>
      storeEncryptionOptions({ encryptedLayout: null, downloadedPieces: new Uint8Array(0) }, HASH);
    const first = fresh();
    const second = fresh();
    expect(first.encryptionVersion).toBe(2);
    expect(first.filenameSalt).toMatch(/^[a-f0-9]{64}$/);
    expect(first.contentSalt).toMatch(/^[a-f0-9]{64}$/);
    expect(first.filenameSalt).not.toBe(first.contentSalt);
    expect(second.filenameSalt).not.toBe(first.filenameSalt);
    expect(second.contentSalt).not.toBe(first.contentSalt);
    expect(first.filenameSalt).not.toContain(HASH.toLowerCase());
  });
});

describe('storage directory names', () => {
  it('are random, in the 16-hex format storage import accepts', () => {
    const first = randomStorageLocation('/downloads');
    const second = randomStorageLocation('/downloads');
    expect(first).toMatch(/^\/downloads\/[a-f0-9]{16}$/);
    expect(second).not.toBe(first);
  });
});
