import { beforeEach, describe, expect, it } from 'vitest';

import { accessTokenStorage, getStorageMode } from './accessTokenStorage';

// Mock sessionStorage
const sessionStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'sessionStorage', {
  value: sessionStorageMock,
});

describe('accessTokenStorage', () => {
  beforeEach(() => {
    sessionStorageMock.clear();
  });

  describe('Memory Storage Mode', () => {
    it('should store and retrieve token data', () => {
      const tokenData = {
        accessToken: 'test-token',
        user: { id: '1', email: 'test@example.com', role: 'user' },
        session: 'session-1',
        timestamp: Date.now(),
      };

      accessTokenStorage.store(tokenData);
      const retrieved = accessTokenStorage.retrieve('session-1');

      expect(retrieved).toEqual(tokenData);
    });

    it('should return null for non-existent session', () => {
      const retrieved = accessTokenStorage.retrieve('non-existent');
      expect(retrieved).toBeNull();
    });

    it('should remove specific session', () => {
      const tokenData = {
        accessToken: 'test-token',
        user: { id: '1', email: 'test@example.com', role: 'user' },
        session: 'session-1',
        timestamp: Date.now(),
      };

      accessTokenStorage.store(tokenData);
      accessTokenStorage.remove('session-1');
      const retrieved = accessTokenStorage.retrieve('session-1');

      expect(retrieved).toBeNull();
    });

    it('should clear all sessions', () => {
      const tokenData1 = {
        accessToken: 'token-1',
        user: { id: '1', email: 'user1@example.com', role: 'user' },
        session: 'session-1',
        timestamp: Date.now(),
      };
      const tokenData2 = {
        accessToken: 'token-2',
        user: { id: '2', email: 'user2@example.com', role: 'user' },
        session: 'session-2',
        timestamp: Date.now(),
      };

      accessTokenStorage.store(tokenData1);
      accessTokenStorage.store(tokenData2);
      accessTokenStorage.clear();

      expect(accessTokenStorage.retrieve('session-1')).toBeNull();
      expect(accessTokenStorage.retrieve('session-2')).toBeNull();
    });

    it('should return all session IDs', () => {
      const tokenData1 = {
        accessToken: 'token-1',
        user: { id: '1', email: 'user1@example.com', role: 'user' },
        session: 'session-1',
        timestamp: Date.now(),
      };
      const tokenData2 = {
        accessToken: 'token-2',
        user: { id: '2', email: 'user2@example.com', role: 'user' },
        session: 'session-2',
        timestamp: Date.now(),
      };

      accessTokenStorage.store(tokenData1);
      accessTokenStorage.store(tokenData2);
      const sessions = accessTokenStorage.getAllSessions();

      expect(sessions).toHaveLength(2);
      expect(sessions).toContain('session-1');
      expect(sessions).toContain('session-2');
    });

    it('should be available', () => {
      expect(accessTokenStorage.isAvailable()).toBe(true);
    });
  });

  describe('getStorageMode', () => {
    it('should return storage mode', () => {
      const mode = getStorageMode();
      expect(typeof mode).toBe('string');
      expect(mode).toMatch(/memory|session/);
    });
  });
});
