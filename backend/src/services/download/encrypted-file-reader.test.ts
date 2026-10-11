import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import EncryptedChunkStore from '../../chunk-stores/encrypted-chunk-store/encrypted-chunk-store';
import { EncryptedFileReader } from './encrypted-file-reader';

describe('EncryptedFileReader', () => {
  it('reads encrypted byte ranges across file and piece boundaries', async () => {
    const location = await mkdtemp(path.join(os.tmpdir(), 'miauflix-encrypted-reader-'));
    const key = 'reader-test-key';
    const storeName = 'torrent - abcdef12';
    const filenameSalt = 'download-a'.repeat(5);
    const plaintext = Buffer.from('ABCDEFGHIJK');
    const files = [
      { path: 'extra.bin', length: 3, offset: 0 },
      { path: 'folder/movie.mkv', length: 7, offset: 3 },
      { path: 'tail.bin', length: 1, offset: 10 },
    ];
    const writer = new EncryptedChunkStore(4, {
      path: location,
      name: storeName,
      files,
      encryptionKey: key,
      filenameSalt,
    });
    try {
      for (let index = 0; index < 3; index += 1) {
        const piece = plaintext.subarray(index * 4, Math.min(plaintext.length, (index + 1) * 4));
        await new Promise<void>((resolve, reject) => {
          writer.put(index, piece, error => (error ? reject(error) : resolve()));
        });
      }
    } finally {
      await new Promise<void>((resolve, reject) => {
        writer.close(error => (error ? reject(error) : resolve()));
      });
    }

    const reader = new EncryptedFileReader(
      location,
      {
        storeName,
        filenameSalt,
        pieceLength: 4,
        files,
        video: { name: 'movie.mkv', path: 'folder/movie.mkv', offset: 3, length: 7 },
      },
      key
    );
    try {
      const output: Buffer[] = [];
      for (let position = 3; position < 10; ) {
        const pieceIndex = Math.floor(position / 4);
        const pieceOffset = position % 4;
        const piece = await reader.readPiece(pieceIndex);
        const bytes = piece.subarray(pieceOffset, Math.min(piece.length, pieceOffset + 2));
        output.push(bytes);
        position += bytes.length;
      }
      expect(Buffer.concat(output)).toEqual(plaintext.subarray(3, 10));
    } finally {
      await reader.close();
      await rm(location, { recursive: true, force: true });
    }
  });

  it('closes only file handles that were opened', async () => {
    const location = await mkdtemp(path.join(os.tmpdir(), 'miauflix-encrypted-reader-'));
    const storeName = 'partial - abcdef12';
    const files = [
      { path: 'movie.mkv', length: 4, offset: 0 },
      { path: 'unselected.bin', length: 4, offset: 4 },
    ];
    const writer = new EncryptedChunkStore(4, {
      path: location,
      name: storeName,
      files,
      encryptionKey: 'reader-test-key',
      filenameSalt: 'download-partial',
    });
    try {
      await new Promise<void>((resolve, reject) => {
        writer.put(0, Buffer.from('DATA'), error => (error ? reject(error) : resolve()));
      });
      await new Promise<void>((resolve, reject) => {
        writer.close(error => (error ? reject(error) : resolve()));
      });
      expect(await readdir(location)).toHaveLength(1);
    } finally {
      await rm(location, { recursive: true, force: true });
    }
  });

  it('reports a clear error when completed local media is missing', async () => {
    const location = await mkdtemp(path.join(os.tmpdir(), 'miauflix-encrypted-reader-'));
    const reader = new EncryptedFileReader(
      location,
      {
        storeName: 'missing - abcdef12',
        filenameSalt: 'download-missing',
        pieceLength: 4,
        files: [{ path: 'movie.mkv', length: 4, offset: 0 }],
        video: { name: 'movie.mkv', path: 'movie.mkv', offset: 0, length: 4 },
      },
      'reader-test-key'
    );
    try {
      await expect(reader.readPiece(0)).rejects.toThrow(
        'Unable to read encrypted local media piece 0'
      );
    } finally {
      await reader.close();
      await rm(location, { recursive: true, force: true });
    }
  });

  it('reopens files only when the persisted filename salt matches the writer', async () => {
    const location = await mkdtemp(path.join(os.tmpdir(), 'miauflix-encrypted-reader-'));
    const key = 'reader-test-key';
    const sourceHash = 'ABCDEF1234';
    const files = [{ path: 'movie.mkv', length: 4, offset: 0 }];
    const writer = new EncryptedChunkStore(4, {
      path: location,
      name: 'movie - abcdef12',
      files,
      encryptionKey: key,
      filenameSalt: `download-${sourceHash}`,
    });
    try {
      await new Promise<void>((resolve, reject) => {
        writer.put(0, Buffer.from('DATA'), error => (error ? reject(error) : resolve()));
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        writer.close(error => (error ? reject(error) : resolve()));
      });
    }

    const staleLayout = {
      storeName: 'movie - abcdef12',
      filenameSalt: `download-${sourceHash.toLowerCase()}`,
      pieceLength: 4,
      files,
      video: { name: 'movie.mkv', path: 'movie.mkv', offset: 0, length: 4 },
    };
    const staleReader = new EncryptedFileReader(location, staleLayout, key);
    try {
      await expect(staleReader.readPiece(0)).rejects.toThrow(
        'Unable to read encrypted local media piece 0'
      );
    } finally {
      await staleReader.close();
    }

    const repairedReader = new EncryptedFileReader(
      location,
      { ...staleLayout, filenameSalt: `download-${sourceHash}` },
      key
    );
    try {
      await expect(repairedReader.readPiece(0)).resolves.toEqual(Buffer.from('DATA'));
    } finally {
      await repairedReader.close();
      await rm(location, { recursive: true, force: true });
    }
  });
});
