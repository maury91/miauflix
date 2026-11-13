# Encrypted chunk storage

The media-load service stores every torrent through [`EncryptedChunkStore`](../src/chunk-stores/encrypted-chunk-store/encrypted-chunk-store.ts), a TypeScript port of [fs-chunk-store](https://github.com/webtorrent/fs-chunk-store) that always encrypts. It implements WebTorrent's chunk-store interface ([`AbstractChunkStore`](../src/chunk-stores/abstract-chunk-store/abstract-chunk-store.ts): `put`, `get` with an optional offset and length, `close`, `destroy`). The unencrypted [`FsChunkStore`](../src/chunk-stores/fs-chunk-store/fs-chunk-store.ts) port remains for comparison and tests.

For what this protects against, and what it does not, see [Storage and privacy](../../../docs/features/storage-privacy.md).

## Keys

The backend sends the service the source security key (`SOURCE_SECURITY_KEY`) when it attaches. A string key is hashed with SHA-256; a `Buffer` key must be 32 bytes.

## Encryption versions

Each source's layout records its `encryptionVersion`. A layout without one is version 1, so files written before versions existed stay readable. New stores use version 2 (`CURRENT_ENCRYPTION_VERSION`).

|                | Version 1 (read only for old files)                          | Version 2                                                                                    |
| -------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Content key    | The security key, shared by every store                      | HMAC-SHA-256 of the security key over a random per-store `contentSalt`                       |
| AES-256-CTR IV | The chunk index; neighbouring chunks overlap their keystream | The chunk's byte offset in 16-byte blocks, so no two positions share keystream               |
| File names     | SHA-256 of base name, key and salt, first 24 hex characters  | HMAC-SHA-256 under the security key over a random per-store `filenameSalt` and the full path |
| File sizes     | Exact                                                        | Padded with random bytes when `STORAGE_PAD_FILE_SIZES` is on (the default)                   |

Both salts are random per store and kept with its layout, never derived from the info hash, so the disk cannot be matched against known torrents even by someone holding the key. CTR mode lets any chunk be read or written without touching the others.

Padding rounds each version 2 file up with Padmé (`paddedLength`): at most about 3% larger, and every file under 64 KiB takes 64 KiB. It never changes what is read, so the setting can be switched at any time; it applies when a file is first opened.

## File handles and removal

Each file opens lazily and counts its in-flight operations. Removing a file stops new operations, waits for running ones, closes the handle and unlinks the file; operations that arrive meanwhile reopen a fresh file. Reclamation relies on this to delete single files of a torrent that is still active (see [Source identity and file claims](../../../docs/architecture/source-identity-and-file-claims.md#per-file-reclamation-and-concurrency)).

## Reading outside WebTorrent

[`encrypted-file-reader.ts`](../src/engine/encrypted-file-reader.ts) opens a store from a stored layout and reads one file's pieces without WebTorrent; the file streamer uses it for retained files. Tests share one suite across both stores ([`create-test-suite.ts`](../tests/chunk-stores/abstract-chunk-store/create-test-suite.ts)).
