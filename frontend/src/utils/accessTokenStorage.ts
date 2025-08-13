/**
 * Access token storage utility
 * Uses memory or sessionStorage based on build-time configuration
 *
 * Configuration:
 * - memory: Uses memory storage (data lost on page refresh)
 * - sessionStorage: Uses sessionStorage (survives page refresh, cleared on browser close)
 *
 * The storage mode is hardcoded at build time via Vite's define config:
 * - __ACCESS_TOKEN_STORAGE_MODE__ = 'memory' | 'sessionStorage'
 */

// Build-time configuration - will be replaced by Vite
declare const __ACCESS_TOKEN_STORAGE_MODE__: 'memory' | 'sessionStorage';

interface TokenData {
  accessToken: string;
  user: {
    id: string;
    email: string;
    role: string;
  };
  session: string;
  timestamp: number;
}

// Multi-session token storage
interface TokenStorage {
  [sessionId: string]: TokenData;
}

abstract class BaseAccessTokenStorage {
  abstract store(tokenData: TokenData): void;
  abstract retrieve(sessionId: string): TokenData | null;
  abstract remove(sessionId: string): void;
  abstract clear(): void;
  abstract getAllSessions(): string[];
  abstract isAvailable(): boolean;
}

class MemoryAccessTokenStorage extends BaseAccessTokenStorage {
  private tokens: TokenStorage = {};

  store(tokenData: TokenData): void {
    this.tokens[tokenData.session] = { ...tokenData, timestamp: Date.now() };
  }

  retrieve(sessionId: string): TokenData | null {
    return this.tokens[sessionId] || null;
  }

  remove(sessionId: string): void {
    delete this.tokens[sessionId];
  }

  clear(): void {
    this.tokens = {};
  }

  getAllSessions(): string[] {
    return Object.keys(this.tokens);
  }

  isAvailable(): boolean {
    return true;
  }
}

class SessionStorageAccessTokenStorage extends BaseAccessTokenStorage {
  private readonly storageKey = 'miauflix_access_tokens';
  private readonly maxAge = 15 * 60 * 1000; // 15 minutes (same as JWT expiry)

  private isStorageAvailable(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }

    try {
      const test = '__access_token_test__';
      sessionStorage.setItem(test, test);
      sessionStorage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  }

  private getTokenStorage(): TokenStorage {
    if (!this.isStorageAvailable()) {
      return {};
    }

    try {
      const stored = sessionStorage.getItem(this.storageKey);
      return stored ? JSON.parse(stored) : {};
    } catch (error) {
      console.error('Failed to parse token storage:', error);
      // Clear corrupted data
      this.clear();
      return {};
    }
  }

  private setTokenStorage(tokens: TokenStorage): void {
    if (!this.isStorageAvailable()) {
      console.warn('sessionStorage not available for access token storage');
      return;
    }

    try {
      sessionStorage.setItem(this.storageKey, JSON.stringify(tokens));
    } catch (error) {
      console.error('Failed to store access tokens:', error);
      // Clear any corrupted data
      try {
        sessionStorage.removeItem(this.storageKey);
      } catch {
        // Ignore errors when clearing
      }
    }
  }

  store(tokenData: TokenData): void {
    const tokens = this.getTokenStorage();
    tokens[tokenData.session] = { ...tokenData, timestamp: Date.now() };
    this.setTokenStorage(tokens);
  }

  retrieve(sessionId: string): TokenData | null {
    const tokens = this.getTokenStorage();
    const tokenData = tokens[sessionId];

    if (!tokenData) {
      return null;
    }

    // Check if token has expired (15 minutes + 1 minute buffer)
    if (Date.now() - tokenData.timestamp > this.maxAge + 60000) {
      this.remove(sessionId);
      return null;
    }

    return tokenData;
  }

  remove(sessionId: string): void {
    const tokens = this.getTokenStorage();
    delete tokens[sessionId];
    this.setTokenStorage(tokens);
  }

  clear(): void {
    if (!this.isStorageAvailable()) {
      return;
    }

    try {
      sessionStorage.removeItem(this.storageKey);
    } catch (error) {
      console.error('Failed to clear access tokens:', error);
    }
  }

  getAllSessions(): string[] {
    const tokens = this.getTokenStorage();
    return Object.keys(tokens);
  }

  isAvailable(): boolean {
    return this.isStorageAvailable();
  }
}

// Factory function to create the appropriate storage instance
function createAccessTokenStorage(): BaseAccessTokenStorage {
  // Default to memory if build variable is not defined
  const mode =
    typeof __ACCESS_TOKEN_STORAGE_MODE__ !== 'undefined' ? __ACCESS_TOKEN_STORAGE_MODE__ : 'memory';

  switch (mode) {
    case 'sessionStorage':
      const sessionStorage = new SessionStorageAccessTokenStorage();
      if (!sessionStorage.isAvailable()) {
        return new MemoryAccessTokenStorage();
      }
      return sessionStorage;
    case 'memory':
    default:
      return new MemoryAccessTokenStorage();
  }
}

// Export singleton instance
export const accessTokenStorage = createAccessTokenStorage();

// Export storage mode for debugging
export const getStorageMode = (): string => {
  return typeof __ACCESS_TOKEN_STORAGE_MODE__ !== 'undefined'
    ? __ACCESS_TOKEN_STORAGE_MODE__
    : 'memory (default)';
};

// Export types for external use
export type { TokenData };
