import { createHash, timingSafeEqual } from 'crypto';

/**
 * Utility functions for secure token hashing
 * Uses SHA-256 for consistent, fast hashing of tokens
 *
 * Security considerations:
 * - SHA-256 is cryptographically secure and fast
 * - No salt needed since tokens are already cryptographically random
 * - Timing-safe comparison prevents timing attacks
 */

/**
 * Hash a token using SHA-256
 * @param token - The token to hash
 * @returns SHA-256 hash of the token (hex encoded)
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Verify a token against its hash using timing-safe comparison
 * @param token - The token to verify
 * @param hash - The stored hash to compare against
 * @returns True if token matches hash, false otherwise
 */
export function verifyToken(token: string, hash: string): boolean {
  const tokenHash = hashToken(token);

  // Convert to buffers for timing-safe comparison
  const tokenHashBuffer = Buffer.from(tokenHash, 'hex');
  const storedHashBuffer = Buffer.from(hash, 'hex');

  // Ensure both buffers are the same length to prevent timing attacks
  if (tokenHashBuffer.length !== storedHashBuffer.length) {
    return false;
  }

  return timingSafeEqual(tokenHashBuffer, storedHashBuffer);
}
