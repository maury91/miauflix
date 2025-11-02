import { compare, hash } from 'bcrypt';
import { randomBytes } from 'crypto';
import type { Context } from 'hono';
import { parse } from 'hono/utils/cookie';
import type { JWTPayload } from 'jose';
import { jwtVerify, SignJWT } from 'jose';
import { hostname } from 'os';

import { ENV } from '@constants';
import type { Database } from '@database/database';
import { AuditEventSeverity, AuditEventType } from '@entities/audit-log.entity';
import type { RefreshToken } from '@entities/refresh-token.entity';
import type { User } from '@entities/user.entity';
import { UserRole } from '@entities/user.entity';
import { InvalidTokenError } from '@errors/auth.errors';
import type { RefreshTokenRepository } from '@repositories/refresh-token.repository';
import type { StreamingKeyRepository } from '@repositories/streaming-key.repository';
import type { UserRepository } from '@repositories/user.repository';
import type { UserDto } from '@routes/auth.types';
import type { StreamingToken } from '@services/auth/auth.types';
import type { AuditLogService } from '@services/security/audit-log.service';
import { InMemoryCache } from '@utils/in-memory-cache';
import { generateSecurePassword } from '@utils/password.util';
import { getRealClientIp } from '@utils/proxy.util';
import { traced } from '@utils/tracing.util';

import {
  generateDeterministicSalt,
  generateStreamingKey,
  hashKeyWithSalt,
  parseStreamingKey,
  validateTokenPayload,
} from './auth.util';

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  session: string;
  user: UserDto;
}

export interface CookieConfig {
  name: string;
  value: string;
  domain?: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: 'strict';
  maxAge: number;
  path: string;
}

export interface SessionInfo {
  session: string;
  user: UserDto;
}

export class AuthService {
  private readonly userRepository: UserRepository;
  private readonly refreshTokenRepository: RefreshTokenRepository;
  private readonly streamingKeyRepository: StreamingKeyRepository;
  private readonly secretKey: Uint8Array;
  private readonly issuer = 'miauflix-api';
  private readonly audience = 'miauflix-client';
  private readonly streamingKeyTTL: number;
  private readonly streamingKeySalt: string;
  private readonly streamingKeyCache = new InMemoryCache<StreamingToken>();

  // Configuration
  private readonly refreshTokenTTL: number;
  private readonly accessTokenTTL: number;
  private readonly refreshTokenMaxRefreshDays: number;
  private readonly maxDeviceSlotsPerUser: number;
  private readonly cookieName: string;
  private readonly accessTokenCookieName: string;
  private readonly cookieDomain?: string;
  private readonly cookieSecure: boolean;

  constructor(
    db: Database,
    private readonly auditLogService: AuditLogService
  ) {
    this.userRepository = db.getUserRepository();
    this.refreshTokenRepository = db.getRefreshTokenRepository();
    this.streamingKeyRepository = db.getStreamingKeyRepository();

    // Convert the secret to a Uint8Array for jose
    this.secretKey = new TextEncoder().encode(ENV('JWT_SECRET'));

    // Configuration
    this.streamingKeyTTL = ENV('STREAM_TOKEN_EXPIRATION');
    this.streamingKeySalt = ENV('STREAM_KEY_SALT');
    this.refreshTokenTTL = ENV('REFRESH_TOKEN_EXPIRATION');
    this.accessTokenTTL = ENV('ACCESS_TOKEN_EXPIRATION');
    this.refreshTokenMaxRefreshDays = ENV('REFRESH_TOKEN_MAX_REFRESH_DAYS');
    this.maxDeviceSlotsPerUser = ENV('MAX_DEVICE_SLOTS_PER_USER');
    this.cookieName = ENV('REFRESH_TOKEN_COOKIE_NAME');
    this.accessTokenCookieName = ENV('ACCESS_TOKEN_COOKIE_NAME');
    this.cookieDomain = ENV('COOKIE_DOMAIN') || undefined;
    this.cookieSecure = ENV('COOKIE_SECURE');
  }

  /**
   * Configures initial admin user if none exists
   */
  @traced('AuthService')
  async configureUsers(): Promise<void> {
    // Check if any admin user exists
    const adminUsers = await this.userRepository.findByRole(UserRole.ADMIN);

    if (adminUsers.length > 0) {
      return; // Admin user already exists, no need to create one
    }

    // Generate admin credentials using hostname
    const adminEmail = `admin@${hostname()}.local`;
    const adminPassword = generateSecurePassword();

    // Create the admin user
    await this.createUser(adminEmail, adminPassword, UserRole.ADMIN);

    console.log(
      `Created initial admin user with email: ${adminEmail} and password: ${adminPassword}`
    );
    console.log('Please change these credentials after first login.');
  }

  @traced('AuthService')
  async createUser(email: string, password: string, role: UserRole = UserRole.USER): Promise<User> {
    const existingUser = await this.userRepository.findByEmail(email);
    if (existingUser) {
      throw new Error('User already exists');
    }

    const passwordHash = await hash(password, 10);

    const newUser = await this.userRepository.create({
      email,
      passwordHash,
      role,
    });

    // Create audit log for user creation
    await this.auditLogService.logSecurityEvent({
      eventType: AuditEventType.USER_CREATION,
      severity: AuditEventSeverity.INFO,
      description: `User created with role: ${role}`,
      userEmail: email,
      metadata: {
        role,
        isEmailVerified: false,
      },
    });

    return newUser;
  }

  @traced('AuthService')
  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.userRepository.findByEmail(email);
    if (!user) return null;

    const isValid = await compare(password, user.passwordHash);
    return isValid ? user : null;
  }

  @traced('AuthService')
  private async generateSession(): Promise<string> {
    // Always generate cryptographically secure random session ID
    return randomBytes(16).toString('base64url'); // Length is 22 characters (16 bytes * 4/3)
  }

  @traced('AuthService')
  async generateTokens(user: User, context: Context): Promise<AuthResult> {
    const ipAddress = getRealClientIp(context) || 'unknown';
    const userAgent = context.req.header('user-agent');

    // Always generate fresh session for security (prevents enumeration attacks)
    const session = await this.generateSession();

    // Generate tokens
    const accessToken = await this.generateAccessToken(user);
    const opaqueRefreshToken = await this.generateOpaqueRefreshToken(
      user,
      session,
      ipAddress,
      userAgent
    );

    return {
      accessToken,
      refreshToken: opaqueRefreshToken,
      session,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
    };
  }

  @traced('AuthService')
  private async generateAccessToken(user: User): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    // Calculate expiration time in seconds (accessTokenTTL is in milliseconds)
    const expirationTime = now + Math.floor(this.accessTokenTTL / 1000);

    return new SignJWT({
      userId: user.id,
      email: user.email,
      role: user.role,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now)
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setExpirationTime(expirationTime)
      .sign(this.secretKey);
  }

  @traced('AuthService')
  private async generateOpaqueRefreshToken(
    user: User,
    session: string,
    ipAddress: string,
    userAgent?: string
  ): Promise<string> {
    // Generate a cryptographically secure random token
    const opaqueToken = randomBytes(32).toString('base64url');

    const expiresAt = new Date();
    expiresAt.setTime(expiresAt.getTime() + this.refreshTokenTTL);

    // Check if user has reached max token limit
    const userTokenCount = await this.refreshTokenRepository.countByUser(user.id);
    if (userTokenCount >= this.maxDeviceSlotsPerUser) {
      // Remove oldest token to make room
      await this.refreshTokenRepository.deleteOldestByUser(user.id);
    }

    // Create new refresh token (starts new chain)
    await this.refreshTokenRepository.create({
      token: opaqueToken,
      userId: user.id,
      session,
      userAgent,
      lastIpAddress: ipAddress,
      lastAccessedAt: new Date(),
      accessCount: 1,
      expiresAt,
      issueIpAddress: ipAddress,
    });

    return opaqueToken;
  }

  @traced('AuthService')
  async verifyAccessToken(token: string) {
    try {
      const { payload } = await jwtVerify<JWTPayload & { userId: string }>(token, this.secretKey, {
        issuer: this.issuer,
        audience: this.audience,
      });

      if (!validateTokenPayload(payload)) {
        throw new InvalidTokenError();
      }

      const { userId, email, role } = payload;

      return {
        userId,
        email,
        role: role as UserRole,
      };
    } catch {
      throw new InvalidTokenError();
    }
  }

  @traced('AuthService')
  async verifyOpaqueRefreshToken(opaqueToken: string, session: string): Promise<RefreshToken> {
    const refreshToken = await this.refreshTokenRepository.findByToken(opaqueToken, session);

    if (!refreshToken) {
      throw new InvalidTokenError();
    }

    // Check if token has expired
    if (refreshToken.expiresAt < new Date()) {
      // Clean up expired token
      await this.refreshTokenRepository.delete(refreshToken.id);
      throw new InvalidTokenError();
    }

    // Check if chain has exceeded maximum refresh lifetime
    if (
      await this.refreshTokenRepository.isChainExpired(
        refreshToken.userId,
        refreshToken.session,
        this.refreshTokenMaxRefreshDays
      )
    ) {
      // Clean up expired token
      await this.refreshTokenRepository.deleteByUserAndSession(
        refreshToken.userId,
        refreshToken.session
      );
      throw new InvalidTokenError();
    }

    return refreshToken;
  }

  @traced('AuthService')
  async refreshTokens(
    opaqueToken: string,
    session: string,
    context: Context
  ): Promise<AuthResult | null> {
    try {
      const ipAddress = getRealClientIp(context) || 'unknown';
      const userAgent = context.req.header('user-agent');

      // Verify the refresh token
      const refreshToken = await this.verifyOpaqueRefreshToken(opaqueToken, session);

      // Generate new access token
      const newAccessToken = await this.generateAccessToken(refreshToken.user);

      // Generate new refresh token
      const newOpaqueToken = randomBytes(32).toString('base64url');
      const expiresAt = new Date();
      expiresAt.setTime(expiresAt.getTime() + this.refreshTokenTTL);

      // Atomically update the refresh token (race condition detection)
      const updateSuccessful = await this.refreshTokenRepository.updateToken(
        opaqueToken,
        newOpaqueToken,
        refreshToken.userId,
        session,
        expiresAt,
        ipAddress,
        userAgent
      );

      if (!updateSuccessful) {
        // Token was already used (race condition or reuse)
        await this.auditLogService.logSecurityEvent({
          eventType: AuditEventType.SUSPICIOUS_ACTIVITY,
          severity: AuditEventSeverity.CRITICAL,
          description: 'Refresh token reuse detected - token already updated',
          userEmail: refreshToken.user.email,
          metadata: {
            originalIssueIp: refreshToken.issueIpAddress,
            reuseIp: ipAddress,
            userAgent,
          },
        });
        throw new InvalidTokenError();
      }

      return {
        accessToken: newAccessToken,
        refreshToken: newOpaqueToken,
        session,
        user: {
          id: refreshToken.user.id,
          email: refreshToken.user.email,
          displayName: refreshToken.user.displayName,
          role: refreshToken.user.role,
        },
      };
    } catch {
      return null;
    }
  }

  @traced('AuthService')
  async getUserFromRefreshToken(opaqueToken: string, session: string): Promise<User | null> {
    try {
      const refreshToken = await this.verifyOpaqueRefreshToken(opaqueToken, session);
      return refreshToken.user;
    } catch {
      return null;
    }
  }

  @traced('AuthService')
  async logout(opaqueToken: string, session: string): Promise<User | null> {
    // Verify the refresh token before deleting it
    const refreshToken = await this.verifyOpaqueRefreshToken(opaqueToken, session);
    const user = refreshToken.user;

    // Revoke only the refresh token for this specific session
    await this.refreshTokenRepository.deleteByUserAndSession(refreshToken.userId, session);

    return user;
  }

  /**
   * Get user by ID
   */
  @traced('AuthService')
  async getUserById(userId: string): Promise<User | null> {
    return this.userRepository.findById(userId);
  }

  /**
   * Get session info from access token
   * Verifies the access token and returns session and user information
   */
  @traced('AuthService')
  async getSessionInfo(
    sessionId: string,
    accessToken: string
  ): Promise<{
    session: string;
    user: UserDto;
  }> {
    // Verify the access token
    const payload = await this.verifyAccessToken(accessToken);

    // Get full user info to include displayName
    const user = await this.userRepository.findById(payload.userId);

    if (!user) {
      throw new InvalidTokenError();
    }

    // Return session info
    return {
      session: sessionId,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
    };
  }

  /**
   * Discover and validate sessions from refresh token cookies in the request
   * Returns valid sessions found in the request cookies
   */
  @traced('AuthService')
  async getSessionsFromCookies(context: Context): Promise<SessionInfo[]> {
    const cookieHeader = context.req.raw.headers.get('cookie');
    if (!cookieHeader) {
      return [];
    }

    // Parse all cookies using Hono's parse function
    const cookies = parse(cookieHeader);

    // Filter cookies that start with refresh token prefix and extract sessions
    const refreshTokenPrefix = `${this.cookieName}_`;
    const refreshTokenCookies = Object.entries(cookies)
      .filter(([name]) => name.startsWith(refreshTokenPrefix))
      .map(([name, value]) => ({
        session: name.substring(refreshTokenPrefix.length),
        token: value,
      }))
      .filter(({ session, token }) => session && token);

    // Validate each refresh token and collect valid sessions
    const verifiedSessions = await Promise.all(
      // Limit to maximum 5 cookies to prevent DoS attacks
      refreshTokenCookies.slice(0, 5).map(async ({ session, token }) => {
        try {
          const refreshToken = await this.verifyOpaqueRefreshToken(token, session);
          const user = await this.userRepository.findById(refreshToken.userId);
          if (user) {
            return {
              session,
              user: {
                id: user.id,
                email: user.email,
                displayName: user.displayName,
                role: user.role,
              },
            };
          }
        } catch {
          return null;
        }
        return null;
      })
    );

    return verifiedSessions.filter((session): session is SessionInfo => session !== null);
  }

  /**
   * Get cookie configuration for refresh tokens
   */
  getCookieConfig(session: string) {
    return {
      name: `${this.cookieName}_${session}`,
      domain: this.cookieDomain,
      secure: this.cookieSecure,
      httpOnly: true,
      sameSite: 'strict' as const,
      maxAge: Math.floor(this.refreshTokenTTL / 1000), // seconds
      path: `/api/auth/`, // Scope cookie to auth endpoints (allows both refresh and logout)
    };
  }

  /**
   * Get cookie configuration for access tokens
   */
  getAccessTokenCookieConfig(session: string) {
    return {
      name: `${this.accessTokenCookieName}_${session}`,
      domain: this.cookieDomain,
      secure: this.cookieSecure,
      httpOnly: true,
      sameSite: 'strict' as const,
      maxAge: Math.floor(this.accessTokenTTL / 1000), // Convert milliseconds to seconds
      path: `/`, // Available on all paths
    };
  }

  /**
   * Get both authentication cookies (access token and refresh token) with their values
   * Returns an array of cookie configs with values, ready to be set
   */
  getCookies(authResult: AuthResult): CookieConfig[] {
    const accessCookieConfig = this.getAccessTokenCookieConfig(authResult.session);
    const refreshCookieConfig = this.getCookieConfig(authResult.session);

    return [
      {
        ...accessCookieConfig,
        value: authResult.accessToken,
      },
      {
        ...refreshCookieConfig,
        value: authResult.refreshToken,
      },
    ];
  }

  /**
   * Generate URL-safe streaming key
   *
   * Creates streaming keys that embed user ID for direct database queries
   * using deterministic salt based on user ID + predefined salt.
   */
  @traced('AuthService')
  async generateStreamingKey(movieId: number, userId: string): Promise<string> {
    const { streamingKey, storedHash } = await generateStreamingKey(userId, this.streamingKeySalt);

    // Store in database
    await this.streamingKeyRepository.create({
      keyHash: storedHash,
      movieId,
      userId,
      expiresAt: new Date(Date.now() + this.streamingKeyTTL),
    });

    return streamingKey;
  }

  /**
   * Find streaming key in database
   */
  @traced('AuthService')
  private async findStreamingKey(key: string, userId: string): Promise<StreamingToken | null> {
    try {
      const deterministicSalt = generateDeterministicSalt(userId, this.streamingKeySalt);
      const hashToFind = await hashKeyWithSalt(key, deterministicSalt);

      const streamingKey = await this.streamingKeyRepository.findByKeyHash(hashToFind);

      if (streamingKey && streamingKey.expiresAt > new Date()) {
        return {
          movieId: streamingKey.movieId,
          userId: streamingKey.userId,
        };
      }
    } catch {
      return null;
    }

    return null;
  }

  /**
   * Verify streaming key with cache-first approach
   */
  @traced('AuthService')
  async verifyStreamingKey(key: string): Promise<StreamingToken> {
    // Fast path: Check cache first
    const cached = this.streamingKeyCache.get(key);
    if (cached) {
      return cached;
    }

    // Extract user ID and random key from the streaming key
    const parsed = parseStreamingKey(key);
    if (!parsed) {
      throw new InvalidTokenError();
    }

    const { userId, randomKey } = parsed;

    // Fallback: Direct database verification with deterministic salt
    const streamingKey = await this.findStreamingKey(randomKey, userId);
    if (streamingKey) {
      // Cache the successful result for future requests
      this.streamingKeyCache.setWithTTL(
        key,
        streamingKey,
        // Cache until the key expires (or slightly before to be safe)
        this.streamingKeyTTL * 0.9
      );

      return streamingKey;
    }

    throw new InvalidTokenError();
  }
}
