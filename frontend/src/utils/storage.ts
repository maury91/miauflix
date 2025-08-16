/**
 * Simple storage utility using localStorage
 * TODO: Replace with a proper frontend storage library in the future
 */

const STORAGE_KEY = 'miauflix_profiles';

export interface ProfileToken {
  profileId: string;
  profileName: string;
  expiresAt?: number; // For UI display purposes only
}

export type StoredProfiles = ProfileToken[];

class SimpleStorageManager {
  private isServerSide(): boolean {
    return typeof window === 'undefined';
  }

  private isStorageAvailable(): boolean {
    if (this.isServerSide()) {
      return false;
    }

    try {
      const test = '__miauflix_storage_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  }

  async setProfiles(profiles: StoredProfiles): Promise<void> {
    if (!this.isStorageAvailable()) {
      console.warn('localStorage not available, skipping profile storage');
      return;
    }

    try {
      const jsonData = JSON.stringify(profiles);
      localStorage.setItem(STORAGE_KEY, jsonData);
    } catch (error) {
      console.error('Failed to store profiles:', error);
      throw new Error('Failed to store profiles');
    }
  }

  async getProfiles(): Promise<StoredProfiles> {
    if (!this.isStorageAvailable()) {
      return [];
    }

    try {
      const jsonData = localStorage.getItem(STORAGE_KEY);
      if (!jsonData) {
        return [];
      }

      return JSON.parse(jsonData) as StoredProfiles;
    } catch (error) {
      console.error('Failed to retrieve profiles:', error);
      // Clear corrupted data
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Ignore errors when clearing
      }
      return [];
    }
  }

  async addProfile(profile: ProfileToken): Promise<void> {
    const profiles = await this.getProfiles();

    // Remove any existing profile with the same ID
    const filteredProfiles = profiles.filter(p => p.profileId !== profile.profileId);

    // Add the new profile
    filteredProfiles.push(profile);

    await this.setProfiles(filteredProfiles);
  }

  async removeProfile(profileId: string): Promise<void> {
    const profiles = await this.getProfiles();
    const filteredProfiles = profiles.filter(p => p.profileId !== profileId);
    await this.setProfiles(filteredProfiles);
  }

  async updateProfile(profileId: string, updates: Partial<ProfileToken>): Promise<void> {
    const profiles = await this.getProfiles();
    const profileIndex = profiles.findIndex(p => p.profileId === profileId);

    if (profileIndex === -1) {
      throw new Error('Profile not found');
    }

    profiles[profileIndex] = { ...profiles[profileIndex], ...updates };
    await this.setProfiles(profiles);
  }

  async clearAll(): Promise<void> {
    if (!this.isStorageAvailable()) {
      return;
    }

    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('Failed to clear storage:', error);
    }
  }

  async getProfileCount(): Promise<number> {
    const profiles = await this.getProfiles();
    return profiles.length;
  }

  async hasProfiles(): Promise<boolean> {
    const count = await this.getProfileCount();
    return count > 0;
  }

  /**
   * Check if stored data exists
   */
  hasStoredData(): boolean {
    if (!this.isStorageAvailable()) {
      return false;
    }
    return localStorage.getItem(STORAGE_KEY) !== null;
  }
}

// Export singleton instance
export const secureStorage = new SimpleStorageManager();
