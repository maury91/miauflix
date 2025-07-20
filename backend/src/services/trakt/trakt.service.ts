import type { Database } from '@database/database';
import type { User } from '@entities/user.entity';
import type { TraktUserRepository } from '@repositories/trakt-user.repository';
import type { UserRepository } from '@repositories/user.repository';
import type { AuthService } from '@services/auth/auth.service';
import type { UserProfileResponse } from '@services/trakt/trakt.types';

import { TraktApi } from './trakt.api';

export class TraktService {
  private readonly traktApi: TraktApi;
  private readonly traktUserRepository: TraktUserRepository;
  private readonly userRepository: UserRepository;
  private readonly authService: AuthService;

  constructor(db: Database, authService: AuthService) {
    this.traktApi = new TraktApi();
    this.traktUserRepository = db.getTraktUserRepository();
    this.userRepository = db.getUserRepository();
    this.authService = authService;
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
  async checkDeviceLogin(deviceCode: string): Promise<User | null> {
    try {
      const tokenResponse = await this.traktApi.checkDeviceCode(deviceCode);

      // Get user profile to get the slug
      const profile = await this.traktApi.getProfile(tokenResponse.access_token);

      // Check if the Trakt account is associated with a user
      const traktUser = await this.traktUserRepository.findByTraktSlug(profile.ids.slug);
      if (!traktUser || !traktUser.user) {
        return null;
      }

      return traktUser.user;
    } catch (error) {
      if (error instanceof Error && error.message.includes('pending')) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Check device authentication status and complete login
   */
  async checkDeviceAuth(
    deviceCode: string,
    userId: string
  ): Promise<{
    user: User;
    profile: UserProfileResponse;
  } | null> {
    try {
      // Get the user first
      const user = await this.userRepository.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const tokenResponse = await this.traktApi.checkDeviceCode(deviceCode);

      // Get user profile to get the slug
      const profile = await this.traktApi.getProfile(tokenResponse.access_token);

      // Check if the Trakt account is already associated with another user
      const existingTraktUser = await this.traktUserRepository.findByTraktSlug(profile.ids.slug);
      if (existingTraktUser && existingTraktUser.userId !== userId) {
        // Disassociate the Trakt account from the old user
        await this.traktUserRepository.disassociateUser(existingTraktUser.traktSlug);
      }

      // Store/update tokens and associate with user
      await this.traktUserRepository.updateTokens(
        profile.ids.slug,
        tokenResponse.access_token,
        tokenResponse.refresh_token,
        tokenResponse.expires_in
      );

      // Associate the Trakt account with the user
      await this.traktUserRepository.associateUser(profile.ids.slug, user);

      return { user, profile };
    } catch (error) {
      if (error instanceof Error && error.message.includes('pending')) {
        return null;
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
