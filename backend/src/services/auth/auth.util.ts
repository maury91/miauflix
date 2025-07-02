import { pbkdf2, randomBytes } from 'crypto';
import { promisify } from 'util';

const pbkdf2Async = promisify(pbkdf2);

/**
 * Generate deterministic salt from user ID and streaming key salt
 */
export function generateDeterministicSalt(userId: string, streamingKeySalt: string): Buffer {
  return Buffer.from(streamingKeySalt + ':' + userId, 'utf8');
}

/**
 * Parse streaming key into user ID and random key components
 */
export function parseStreamingKey(key: string): { userId: string; randomKey: string } | null {
  const keyParts = key.split(':');
  if (keyParts.length !== 2) {
    return null;
  }

  const [userId, randomKey] = keyParts;
  if (!userId || !randomKey) {
    return null;
  }

  return { userId, randomKey };
}

/**
 * Validate JWT token payload structure
 */
export function validateTokenPayload(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any
): payload is { userId: string; email: string; role: string } {
  return (
    payload &&
    typeof payload.userId === 'string' &&
    typeof payload.email === 'string' &&
    typeof payload.role === 'string' &&
    payload.userId.length > 0 &&
    payload.email.length > 0 &&
    payload.role.length > 0
  );
}

/**
 * Hash a key with deterministic salt using PBKDF2
 */
export async function hashKeyWithSalt(key: string, salt: Buffer): Promise<string> {
  const keyHash = await pbkdf2Async(key, salt, 1000, 32, 'sha256');
  return keyHash.toString('hex');
}

/**
 * Generate streaming key and hash it with deterministic salt
 *
 * @param userId - User ID
 * @param streamingKeySalt - Salt for generating deterministic salt
 * @returns Streaming key and hash
 */
export async function generateStreamingKey(
  userId: string,
  streamingKeySalt: string
): Promise<{ streamingKey: string; storedHash: string }> {
  // Generate 30 random bytes -> 40 URL-safe characters
  const randomData = randomBytes(30);
  const base64Key = randomData.toString('base64');
  const randomKey = base64Key.replace(/\+/g, '-').replace(/\//g, '_');

  // Create streaming key with embedded user ID: userId:randomKey
  const streamingKey = `${userId}:${randomKey}`;

  // Generate deterministic salt from user ID + predefined salt
  const deterministicSalt = generateDeterministicSalt(userId, streamingKeySalt);

  // Hash only the random part for secure database storage
  const storedHash = await hashKeyWithSalt(randomKey, deterministicSalt);

  return { streamingKey, storedHash };
}
