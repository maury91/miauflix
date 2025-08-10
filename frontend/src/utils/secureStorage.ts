/**
 * Secure storage utility with Web Crypto API encryption fallback to obfuscated localStorage
 */

const STORAGE_KEY = 'miauflix_profiles';
const ENCRYPTION_KEY_NAME = 'miauflix_storage_key';

export interface ProfileToken {
  profileId: string;
  profileName: string;
  accessToken: string;
  refreshToken: string;
  expiresAt?: number;
}

export type StoredProfiles = ProfileToken[];

class SecureStorageManager {
  private cryptoKey: CryptoKey | null = null;
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Check if Web Crypto API is available
      if (typeof crypto !== 'undefined' && crypto.subtle) {
        await this.initializeCrypto();
      } else {
        console.warn('Web Crypto API not available, falling back to obfuscated storage');
      }
    } catch (error) {
      console.warn('Failed to initialize crypto, falling back to obfuscated storage:', error);
    }

    this.initialized = true;
  }

  private async initializeCrypto(): Promise<void> {
    try {
      // Try to load existing key from localStorage
      const storedKey = localStorage.getItem(ENCRYPTION_KEY_NAME);

      if (storedKey) {
        // Import existing key
        const keyData = new Uint8Array(JSON.parse(storedKey));
        this.cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, false, [
          'encrypt',
          'decrypt',
        ]);
      } else {
        // Generate new key
        this.cryptoKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
          'encrypt',
          'decrypt',
        ]);

        // Export and store the key
        const exportedKey = await crypto.subtle.exportKey('raw', this.cryptoKey);
        const keyArray = Array.from(new Uint8Array(exportedKey));
        localStorage.setItem(ENCRYPTION_KEY_NAME, JSON.stringify(keyArray));
      }
    } catch (error) {
      console.warn('Crypto initialization failed:', error);
      this.cryptoKey = null;
    }
  }

  private async encryptData(data: string): Promise<string> {
    if (!this.cryptoKey) {
      // Fallback to simple obfuscation
      return btoa(encodeURIComponent(data));
    }

    try {
      const encoder = new TextEncoder();
      const iv = crypto.getRandomValues(new Uint8Array(12));

      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        this.cryptoKey,
        encoder.encode(data)
      );

      // Combine IV and encrypted data
      const combined = new Uint8Array(iv.length + encrypted.byteLength);
      combined.set(iv);
      combined.set(new Uint8Array(encrypted), iv.length);

      // Convert to base64
      return btoa(String.fromCharCode(...combined));
    } catch (error) {
      console.warn('Encryption failed, using obfuscation:', error);
      return btoa(encodeURIComponent(data));
    }
  }

  private async decryptData(encryptedData: string): Promise<string> {
    if (!this.cryptoKey) {
      // Fallback to simple deobfuscation
      try {
        return decodeURIComponent(atob(encryptedData));
      } catch (error) {
        console.warn('Deobfuscation failed:', error);
        throw new Error('Failed to decrypt data');
      }
    }

    try {
      // Convert from base64
      const combined = new Uint8Array(
        atob(encryptedData)
          .split('')
          .map(c => c.charCodeAt(0))
      );

      // Extract IV and encrypted data
      const iv = combined.slice(0, 12);
      const encrypted = combined.slice(12);

      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        this.cryptoKey,
        encrypted
      );

      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    } catch (error) {
      console.warn('Decryption failed, trying deobfuscation:', error);
      try {
        return decodeURIComponent(atob(encryptedData));
      } catch (fallbackError) {
        console.warn('Deobfuscation also failed:', fallbackError);
        throw new Error('Failed to decrypt data');
      }
    }
  }

  async setProfiles(profiles: StoredProfiles): Promise<void> {
    await this.initialize();

    try {
      const jsonData = JSON.stringify(profiles);
      const encryptedData = await this.encryptData(jsonData);
      localStorage.setItem(STORAGE_KEY, encryptedData);
    } catch (error) {
      console.error('Failed to store profiles:', error);
      throw new Error('Failed to store profiles securely');
    }
  }

  async getProfiles(): Promise<StoredProfiles> {
    await this.initialize();

    try {
      const encryptedData = localStorage.getItem(STORAGE_KEY);
      if (!encryptedData) {
        return [];
      }

      const jsonData = await this.decryptData(encryptedData);
      return JSON.parse(jsonData) as StoredProfiles;
    } catch (error) {
      console.error('Failed to retrieve profiles:', error);
      // Clear corrupted data
      localStorage.removeItem(STORAGE_KEY);
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
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(ENCRYPTION_KEY_NAME);
    this.cryptoKey = null;
    this.initialized = false;
  }

  async getProfileCount(): Promise<number> {
    const profiles = await this.getProfiles();
    return profiles.length;
  }

  async hasProfiles(): Promise<boolean> {
    const count = await this.getProfileCount();
    return count > 0;
  }
}

// Export singleton instance
export const secureStorage = new SecureStorageManager();
