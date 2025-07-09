import type { Database } from '@database/database';
import type { TraktUserRepository } from '@repositories/trakt-user.repository';
import type { UserRepository } from '@repositories/user.repository';
import type { DeviceAuthCheckResponse } from '@services/trakt/trakt.types';

import { TraktApi } from './trakt.api';

export class TraktService {
  private readonly traktApi: TraktApi;
  private readonly traktUserRepository: TraktUserRepository;
  private readonly userRepository: UserRepository;

  constructor(db: Database) {
    this.traktApi = new TraktApi();
    this.traktUserRepository = db.getTraktUserRepository();
    this.userRepository = db.getUserRepository();
  }

  /**
   * Test if Trakt service is properly configured
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.traktApi.test();
      return true;
    } catch (error) {
      console.error('Trakt test connection failed:', error);
      return false;
    }
  }

  /**
   * Initiate Trakt device authentication
   */
  async initiateDeviceAuth() {
    return await this.traktApi.getDeviceCode();
  }

  /**
   * Check device authentication status and complete login
   */
  async checkDeviceAuth(deviceCode: string, userId: string): Promise<DeviceAuthCheckResponse> {
    try {
      // Get the user first
      const user = await this.userRepository.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const tokenResponse = await this.traktApi.checkDeviceCode(deviceCode);

      // Get user profile to get the slug
      const profile = await this.traktApi.getProfile(tokenResponse.access_token);

      // Store/update tokens and associate with user
      await this.traktUserRepository.updateTokens(
        profile.ids.slug,
        tokenResponse.access_token,
        tokenResponse.refresh_token,
        tokenResponse.expires_in
      );

      // Associate the Trakt account with the user
      await this.traktUserRepository.associateUser(profile.ids.slug, user);

      return {
        success: true,
        traktUsername: profile.username,
        traktSlug: profile.ids.slug,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('pending')) {
        return { success: false, pending: true };
      }
      throw error;
    }
  }

  /**
   * Associate a Trakt user with a system user (admin only)
   */
  async associateTraktUser(traktSlug: string, userEmail: string) {
    const user = await this.userRepository.findByEmail(userEmail);
    if (!user) {
      throw new Error('User not found');
    }

    return await this.traktUserRepository.associateUser(traktSlug, user);
  }

  /**
   * Get user's Trakt association
   */
  async getUserTraktAssociation(userId: string) {
    return await this.traktUserRepository.findByUserId(userId);
  }

  /**
   * Refresh user's Trakt token if needed
   */
  async refreshUserToken(userId: string): Promise<string | null> {
    const traktUser = await this.traktUserRepository.findByUserId(userId);

    if (!traktUser || !traktUser.refreshToken) {
      return null;
    }

    // Check if token needs refresh (refresh 5 minutes before expiry)
    const now = new Date();
    const expiryBuffer = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes buffer

    if (traktUser.tokenExpiresAt && traktUser.tokenExpiresAt > expiryBuffer) {
      return traktUser.accessToken;
    }

    try {
      const tokenResponse = await this.traktApi.refreshToken(traktUser.refreshToken);

      await this.traktUserRepository.updateTokens(
        traktUser.traktSlug,
        tokenResponse.access_token,
        tokenResponse.refresh_token,
        tokenResponse.expires_in
      );

      return tokenResponse.access_token;
    } catch (error) {
      console.error('Failed to refresh Trakt token:', error);
      return null;
    }
  }

  /**
   * Get valid access token for user
   */
  async getValidAccessToken(userId: string): Promise<string | null> {
    return await this.refreshUserToken(userId);
  }
}
