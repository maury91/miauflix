# Encrypted Chunk Store System

The Encrypted Chunk Store provides secure, WebTorrent-compatible storage for torrent data with mandatory AES-256-CTR encryption and filename obfuscation capabilities.

## Overview

The [`EncryptedChunkStore`](../src/chunk-stores/encrypted-chunk-store/encrypted-chunk-store.ts) extends the [abstract-chunk-store](https://github.com/mafintosh/abstract-chunk-store) interface (ported to TypeScript for this project) and is based on [fs-chunk-store](https://github.com/webtorrent/fs-chunk-store) (also ported to TypeScript with encryption enhancements).

This implementation provides secure storage for sensitive torrent data by encrypting all chunks before writing to disk and obfuscating filenames to prevent content identification.

## Architecture

### Base Implementation

The encrypted chunk store extends [`AbstractChunkStore`](../src/chunk-stores/abstract-chunk-store/abstract-chunk-store.ts), which provides the standard WebTorrent chunk store interface:

```typescript
export default abstract class AbstractChunkStore {
  public readonly chunkLength: number;

  public abstract put(index: number, buf: Buffer, cb?: Callback): void;
  public abstract get(index: number, cb?: Callback<Buffer>): void;
  public abstract get(index: number, opts?: GetOptions | null, cb?: Callback<Buffer>): void;
  public abstract close(cb?: Callback): void;
  public abstract destroy(cb?: Callback): void;
}
```

### Encryption Features

#### Mandatory AES-256-CTR Encryption

- **Counter Mode**: Enables random access to encrypted chunks without decrypting entire files
- **Deterministic IVs**: Each chunk uses a unique IV based on its index for independent decryption
- **32-byte Keys**: Supports both Buffer keys and string keys (automatically hashed with SHA-256)

#### Filename Obfuscation

- **Deterministic Generation**: Same inputs always produce the same obfuscated filename
- **SHA-256 Hashing**: Combines original filename, encryption key, and salt
- **24-character Hex**: Results in random-appearing but reproducible filenames

## Configuration

### Storage Options

```typescript
interface StorageOptions {
  name?: string; // Storage instance name
  addUID?: boolean; // Add unique identifier to path
  path?: string; // Base storage path
  files?: StorageFile[]; // Multi-file torrent configuration
  length?: number; // Total storage length
  encryptionKey: Buffer | string; // Required: encryption key
  filenameSalt?: string; // Optional: salt for filename generation
}
```

### Encryption Key Requirements

The encryption key is mandatory and can be provided as:

- **Buffer**: Must be exactly 32 bytes for AES-256
- **String**: Automatically hashed with SHA-256 to create a 32-byte key

```typescript
// Using a Buffer key (recommended for production)
const keyBuffer = crypto.randomBytes(32);
const store = new EncryptedChunkStore(16384, {
  encryptionKey: keyBuffer,
  path: './encrypted-storage',
});

// Using a string key (automatically hashed)
const store = new EncryptedChunkStore(16384, {
  encryptionKey: process.env.ENCRYPTION_KEY,
  path: './encrypted-storage',
});
```

## Encryption Implementation

### Chunk Encryption

Each chunk is encrypted with AES-256-CTR using a deterministic IV:

```typescript
private encryptBuffer(buffer: Buffer, chunkIndex: number): Buffer {
  // Generate deterministic IV based on chunk index for CTR mode
  const iv = Buffer.alloc(16);
  iv.writeUInt32BE(chunkIndex, 12); // Put chunk index in last 4 bytes

  const cipher = createCipheriv('aes-256-ctr', this.encryptionKey, iv);
  return Buffer.concat([cipher.update(buffer), cipher.final()]);
}
```

### Chunk Decryption

Decryption uses the same deterministic IV generation:

```typescript
private decryptBuffer(buffer: Buffer, chunkIndex: number): Buffer {
  // Generate the same deterministic IV based on chunk index
  const iv = Buffer.alloc(16);
  iv.writeUInt32BE(chunkIndex, 12);

  const decipher = createDecipheriv('aes-256-ctr', this.encryptionKey, iv);
  return Buffer.concat([decipher.update(buffer), decipher.final()]);
}
```

### Filename Obfuscation

Filenames are deterministically obfuscated using the encryption key and salt:

```typescript
function generateDeterministicFilename(
  originalFilename: string,
  encryptionKey: Buffer,
  salt: string
): string {
  return createHash('sha256')
    .update(originalFilename, 'utf8')
    .update(encryptionKey)
    .update(salt, 'utf8')
    .digest('hex')
    .substring(0, 24);
}
```

## WebTorrent Integration

### Standard Usage

The encrypted chunk store is fully compatible with WebTorrent clients:

```typescript
import WebTorrent from 'webtorrent';
import EncryptedChunkStore from './chunk-stores/encrypted-chunk-store';

const client = new WebTorrent();

client.add(magnetUri, {
  store: (chunkLength: number) =>
    new EncryptedChunkStore(chunkLength, {
      encryptionKey: process.env.ENCRYPTION_KEY,
      path: './secure-downloads',
      filenameSalt: 'miauflix-salt',
    }),
});
```

### Factory Pattern

```typescript
type ChunkStoreFactory = (chunkLength: number) => AbstractChunkStore;

const createSecureStore: ChunkStoreFactory = chunkLength =>
  new EncryptedChunkStore(chunkLength, {
    encryptionKey: getEncryptionKey(),
    path: getSecureStoragePath(),
    filenameSalt: getFilenameSalt(),
  });
```

## Multi-file Support

### File Configuration

For torrents with multiple files, provide a files array:

```typescript
const files = [
  { path: 'movie.mp4', length: 2000000000 },
  { path: 'subtitles/english.srt', length: 50000 },
  { path: 'subtitles/spanish.srt', length: 45000 },
];

const store = new EncryptedChunkStore(chunkLength, {
  files,
  encryptionKey: encryptionKey,
  path: './encrypted-movies',
});
```

### Chunk Mapping

The system automatically handles chunk-to-file mapping:

1. **Offset Calculation**: Determines byte offsets for each file
2. **Cross-file Chunks**: Handles chunks that span multiple files
3. **Encrypted Segments**: Each file segment is encrypted independently

## Performance Characteristics

### Encryption Overhead

- **CTR Mode**: Minimal performance impact with random access capability
- **No IV Storage**: Deterministic IV generation eliminates metadata overhead
- **Hardware Acceleration**: Leverages AES-NI instructions when available

### Random Access

The CTR encryption mode enables efficient random access:

- **Independent Chunks**: Each chunk can be decrypted without reading others
- **Partial Reads**: Supports offset and length parameters for sub-chunk access
- **Concurrent Access**: Multiple chunks can be accessed simultaneously

## Security Features

### Data Protection

1. **Encryption at Rest**: All data is encrypted before writing to disk
2. **Key-based Access**: Data is only accessible with the correct encryption key
3. **Filename Obfuscation**: Content cannot be identified from filenames
4. **No Plaintext**: No sensitive data is ever stored in plaintext

### Best Practices

#### Key Management

- Use cryptographically secure random keys (32 bytes)
- Store keys securely (environment variables, key management services)
- Implement key rotation where possible
- Restrict key access to authorized processes

#### Storage Security

- Set appropriate directory permissions (700 recommended)
- Use unique filename salts for different applications
- Monitor storage access and implement audit logging
- Secure cleanup of temporary files

## Error Handling

### Common Scenarios

The encrypted chunk store provides detailed error messages for common issues:

```typescript
// Invalid encryption key
throw new Error('Encryption key is required for encrypted chunk store');
throw new Error('Encryption key buffer must be exactly 32 bytes for AES-256');

// Encryption/decryption failures
throw new Error(`Encryption failed: ${error.message}`);
throw new Error(`Decryption failed: ${error.message}`);

// Storage operations
throw new Error('Storage is closed');
throw new Error('Chunk length must be ' + this.chunkLength);
```

### Recovery Strategies

```typescript
store.get(index, (err, buffer) => {
  if (err) {
    if (err.message.includes('Decryption failed')) {
      // Verify encryption key is correct
      console.error('Invalid encryption key or corrupted data');
      return;
    }
    if (err.message.includes('Storage is closed')) {
      // Reinitialize storage
      console.error('Storage was closed, reinitializing...');
      return;
    }
    // Handle other errors
    console.error('Unexpected error:', err);
  }
  // Process decrypted buffer
});
```

## Usage Examples

### Basic Operations

```typescript
const store = new EncryptedChunkStore(16384, {
  encryptionKey: 'your-secure-encryption-key',
  path: './encrypted-data',
  filenameSalt: 'unique-salt',
});

// Store encrypted chunk
const chunkData = Buffer.from('sensitive data');
store.put(0, chunkData, err => {
  if (err) console.error('Failed to store chunk:', err);
  else console.log('Chunk stored securely');
});

// Retrieve and decrypt chunk
store.get(0, (err, buffer) => {
  if (err) console.error('Failed to retrieve chunk:', err);
  else console.log('Retrieved data:', buffer.toString());
});

// Partial chunk access
store.get(0, { offset: 100, length: 50 }, (err, buffer) => {
  if (err) console.error('Failed to retrieve partial chunk:', err);
  else console.log('Partial data:', buffer.toString());
});
```

### Cleanup

```typescript
// Close storage (stops accepting new operations)
store.close(err => {
  if (err) console.error('Error closing storage:', err);
  else console.log('Storage closed successfully');
});

// Destroy storage (deletes all data)
store.destroy(err => {
  if (err) console.error('Error destroying storage:', err);
  else console.log('Storage destroyed successfully');
});
```

## Related Components

- **[VPN Fallback System](vpn-fallback-system.md)**: Network security for torrent operations
- **[Streaming Services](streaming-services.md)**: Media delivery using encrypted storage
- **[Security](security.md)**: Overall security architecture and policies

## Troubleshooting

### Debugging Encryption Issues

```typescript
// Test encryption/decryption directly
const testData = Buffer.from('test chunk data');
const encryptionKey = crypto.randomBytes(32);

try {
  const store = new EncryptedChunkStore(16384, {
    encryptionKey,
    path: './test-storage',
  });

  // Test round-trip
  store.put(0, testData, err => {
    if (err) throw err;

    store.get(0, (err, retrieved) => {
      if (err) throw err;
      console.log('Encryption test:', testData.equals(retrieved) ? 'PASS' : 'FAIL');
    });
  });
} catch (error) {
  console.error('Encryption test failed:', error);
}
```

### Common Issues

1. **Key Length Errors**: Ensure encryption keys are exactly 32 bytes
2. **Permission Denied**: Check directory write permissions
3. **Corrupted Data**: Verify encryption key consistency across operations
4. **Storage Space**: Monitor available disk space for large torrents
