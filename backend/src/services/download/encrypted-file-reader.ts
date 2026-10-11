import type { EncryptedStorageLayout } from '@entities/storage.entity';

import EncryptedChunkStore from '../../chunk-stores/encrypted-chunk-store/encrypted-chunk-store';

/** Reads a byte range from the existing encrypted torrent chunk files. */
export class EncryptedFileReader {
  private readonly store: EncryptedChunkStore;

  constructor(location: string, layout: EncryptedStorageLayout, encryptionKey: Buffer | string) {
    const selectedFile = layout.files.find(file => file.path === layout.video.path);
    if (
      !Number.isSafeInteger(layout.pieceLength) ||
      layout.pieceLength <= 0 ||
      !location ||
      !layout.storeName ||
      !layout.filenameSalt ||
      !selectedFile ||
      selectedFile.offset !== layout.video.offset ||
      selectedFile.length !== layout.video.length ||
      layout.files.some(
        file =>
          !file.path ||
          !Number.isSafeInteger(file.length) ||
          file.length < 0 ||
          !Number.isSafeInteger(file.offset) ||
          file.offset < 0
      )
    ) {
      throw new Error('Encrypted media layout is invalid');
    }

    this.store = new EncryptedChunkStore(layout.pieceLength, {
      path: location,
      name: layout.storeName,
      files: layout.files,
      encryptionKey,
      filenameSalt: layout.filenameSalt,
    });
  }

  async readPiece(index: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      this.store.get(index, (error, buffer) => {
        if (error) {
          const detail = error instanceof Error ? error.message : String(error);
          reject(
            new Error(`Unable to read encrypted local media piece ${index}: ${detail}`, {
              cause: error,
            })
          );
        } else resolve(buffer!);
      });
    });
  }

  async close(): Promise<void> {
    if (this.store.closed) return;
    await new Promise<void>((resolve, reject) => {
      this.store.close(error => (error ? reject(error) : resolve()));
    });
  }
}
