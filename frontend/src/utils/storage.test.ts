import { beforeEach, describe, expect, it } from 'vitest';

import { secureStorage } from './storage';

// Mock localStorage
const localStorageMock = (() => {
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

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('secureStorage', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  describe('setProfiles and getProfiles', () => {
    it('should store and retrieve profiles', async () => {
      const profiles = [
        { profileId: '1', profileName: 'User 1', expiresAt: Date.now() + 1000 },
        { profileId: '2', profileName: 'User 2', expiresAt: Date.now() + 2000 },
      ];

      await secureStorage.setProfiles(profiles);
      const retrieved = await secureStorage.getProfiles();

      expect(retrieved).toEqual(profiles);
    });

    it('should return empty array when no profiles exist', async () => {
      const profiles = await secureStorage.getProfiles();
      expect(profiles).toEqual([]);
    });

    it('should handle corrupted data gracefully', async () => {
      // Set invalid JSON
      localStorageMock.setItem('miauflix_profiles', 'invalid json');

      const profiles = await secureStorage.getProfiles();
      expect(profiles).toEqual([]);
    });
  });

  describe('addProfile', () => {
    it('should add a new profile', async () => {
      const profile = { profileId: '1', profileName: 'Test User' };

      await secureStorage.addProfile(profile);
      const profiles = await secureStorage.getProfiles();

      expect(profiles).toHaveLength(1);
      expect(profiles[0]).toEqual(profile);
    });

    it('should replace existing profile with same ID', async () => {
      const profile1 = { profileId: '1', profileName: 'User 1' };
      const profile2 = { profileId: '1', profileName: 'User 1 Updated' };

      await secureStorage.addProfile(profile1);
      await secureStorage.addProfile(profile2);
      const profiles = await secureStorage.getProfiles();

      expect(profiles).toHaveLength(1);
      expect(profiles[0]).toEqual(profile2);
    });
  });

  describe('removeProfile', () => {
    it('should remove specified profile', async () => {
      const profiles = [
        { profileId: '1', profileName: 'User 1' },
        { profileId: '2', profileName: 'User 2' },
      ];

      await secureStorage.setProfiles(profiles);
      await secureStorage.removeProfile('1');
      const remaining = await secureStorage.getProfiles();

      expect(remaining).toHaveLength(1);
      expect(remaining[0].profileId).toBe('2');
    });

    it('should handle removing non-existent profile', async () => {
      await secureStorage.setProfiles([{ profileId: '1', profileName: 'User 1' }]);

      expect(async () => {
        await secureStorage.removeProfile('non-existent');
      }).not.toThrow();
    });
  });

  describe('updateProfile', () => {
    it('should update existing profile', async () => {
      const profile = { profileId: '1', profileName: 'User 1' };
      await secureStorage.addProfile(profile);

      await secureStorage.updateProfile('1', { profileName: 'Updated User' });
      const profiles = await secureStorage.getProfiles();

      expect(profiles[0].profileName).toBe('Updated User');
    });

    it('should throw error when updating non-existent profile', async () => {
      await expect(
        secureStorage.updateProfile('non-existent', { profileName: 'Updated' })
      ).rejects.toThrow('Profile not found');
    });
  });

  describe('clearAll', () => {
    it('should clear all profiles', async () => {
      await secureStorage.setProfiles([
        { profileId: '1', profileName: 'User 1' },
        { profileId: '2', profileName: 'User 2' },
      ]);

      await secureStorage.clearAll();
      const profiles = await secureStorage.getProfiles();

      expect(profiles).toEqual([]);
    });
  });

  describe('getProfileCount', () => {
    it('should return correct profile count', async () => {
      await secureStorage.setProfiles([
        { profileId: '1', profileName: 'User 1' },
        { profileId: '2', profileName: 'User 2' },
      ]);

      const count = await secureStorage.getProfileCount();
      expect(count).toBe(2);
    });

    it('should return 0 when no profiles exist', async () => {
      const count = await secureStorage.getProfileCount();
      expect(count).toBe(0);
    });
  });

  describe('hasProfiles', () => {
    it('should return true when profiles exist', async () => {
      await secureStorage.addProfile({ profileId: '1', profileName: 'User 1' });
      const hasProfiles = await secureStorage.hasProfiles();
      expect(hasProfiles).toBe(true);
    });

    it('should return false when no profiles exist', async () => {
      const hasProfiles = await secureStorage.hasProfiles();
      expect(hasProfiles).toBe(false);
    });
  });

  describe('hasStoredData', () => {
    it('should return true when data exists', () => {
      localStorageMock.setItem('miauflix_profiles', '[]');
      expect(secureStorage.hasStoredData()).toBe(true);
    });

    it('should return false when no data exists', () => {
      expect(secureStorage.hasStoredData()).toBe(false);
    });
  });
});
