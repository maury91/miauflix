import { compare, hash } from 'bcrypt';
import type { JWTPayload } from 'jose';
import { jwtVerify, SignJWT } from 'jose';
import { hostname } from 'os';
import { v4 as uuidv4 } from 'uuid';

import { ENV } from '@constants';
import type { Database } from '@database/database';
import { AuditEventSeverity, AuditEventType } from '@entities/audit-log.entity';
import type { User } from '@entities/user.entity';
import { UserRole } from '@entities/user.entity';
import { InvalidTokenError } from '@errors/auth.errors';
import type { RefreshTokenRepository } from '@repositories/refresh-token.repository';
import type { StreamingKeyRepository } from '@repositories/streaming-key.repository';
import type { UserRepository } from '@repositories/user.repository';
import type { AuditLogService } from '@services/security/audit-log.service';
import { InMemoryCache } from '@utils/in-memory-cache';
import { generateSecurePassword } from '@utils/password.util';

import {
  generateDeterministicSalt,
  generateStreamingKey,
  hashKeyWithSalt,
  parseStreamingKey,
  validateTokenPayload,
} from './auth.util';

interface StreamingToken {
  movieId: number;
  userId: string;
}

export class AuthService {
  private readonly userRepository: UserRepository;
  private readonly refreshTokenRepository: RefreshTokenRepository;
  private readonly streamingKeyRepository: StreamingKeyRepository;
  private readonly secretKey: Uint8Array;
  private readonly refreshSecretKey: Uint8Array;
  private readonly issuer = 'miauflix-api';
  private readonly audience = 'miauflix-client';
  private readonly streamingKeyTTL: number;
  private readonly streamingKeySalt: string;
  private readonly streamingKeyCache = new InMemoryCache<StreamingToken>();

  constructor(
    db: Database,
    private readonly auditLogService: AuditLogService
  ) {
    this.userRepository = db.getUserRepository();
    this.refreshTokenRepository = db.getRefreshTokenRepository();
    this.streamingKeyRepository = db.getStreamingKeyRepository();

    // Convert the secret to a Uint8Array for jose
    this.secretKey = new TextEncoder().encode(ENV('JWT_SECRET'));
    this.refreshSecretKey = new TextEncoder().encode(ENV('REFRESH_TOKEN_SECRET'));
    this.streamingKeyTTL = ENV('STREAM_TOKEN_EXPIRATION');
    this.streamingKeySalt = ENV('STREAM_KEY_SALT');
  }

  /**
   * Configures initial admin user if none exists
   */
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

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.userRepository.findByEmail(email);
    if (!user) return null;

    const isValid = await compare(password, user.passwordHash);
    return isValid ? user : null;
  }

  async generateTokens(user: User) {
    const accessToken = await this.generateAccessToken(user);
    const refreshToken = await this.generateRefreshToken(user);

    return {
      accessToken,
      refreshToken,
    };
  }

  private async generateAccessToken(user: User): Promise<string> {
    const now = Math.floor(Date.now() / 1000);

    return new SignJWT({
      userId: user.id,
      email: user.email,
      role: user.role,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now)
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setExpirationTime('15m')
      .sign(this.secretKey);
  }

  private async generateRefreshToken(user: User): Promise<string> {
    const now = new Date();
    const token = uuidv4();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now

    await this.refreshTokenRepository.create({
      token,
      userId: user.id,
      expiresAt,
    });

    return new SignJWT({
      token,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now)
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setExpirationTime('7d')
      .sign(this.refreshSecretKey);
  }

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

  async verifyRefreshToken(refreshToken: string) {
    try {
      const { payload } = await jwtVerify<JWTPayload & { token: string }>(
        refreshToken,
        this.refreshSecretKey,
        {
          issuer: this.issuer,
          audience: this.audience,
        }
      );

      if (!payload.token) {
        throw new InvalidTokenError();
      }

      return payload;
    } catch {
      throw new InvalidTokenError();
    }
  }

  async refreshAccessToken(refreshToken: string): Promise<{
    tokens: { accessToken: string; refreshToken: string };
    email: string;
  } | null> {
    const refreshTokenPayload = await this.verifyRefreshToken(refreshToken);

    const tokenEntity = await this.refreshTokenRepository.findByToken(refreshTokenPayload.token);

    if (!tokenEntity || tokenEntity.expiresAt < new Date()) {
      return null;
    }

    // Generate new tokens
    const newTokens = await this.generateTokens(tokenEntity.user);

    // Delete the old refresh token
    await this.refreshTokenRepository.delete(tokenEntity.id);

    return {
      tokens: {
        accessToken: newTokens.accessToken,
        refreshToken: newTokens.refreshToken,
      },
      email: tokenEntity.user.email,
    };
  }

  async logout(refreshToken: string): Promise<User | null> {
    const tokenEntity = await this.refreshTokenRepository.findByToken(refreshToken);

    if (tokenEntity) {
      await this.refreshTokenRepository.delete(tokenEntity.id);
      return tokenEntity.user;
    }

    return null;
  }

  /**
   * Generate URL-safe streaming key
   *
   * Creates streaming keys that embed user ID for direct database queries
   * using deterministic salt based on user ID + predefined salt.
   */
  async generateStreamingKey(movieId: number, userId: string): Promise<string> {
    const { streamingKey, storedHash } = await generateStreamingKey(userId, this.streamingKeySalt);

    // Store in database
    await this.streamingKeyRepository.create({
      keyHash: storedHash,
      movieId,
      userId: parseInt(userId, 10),
      expiresAt: new Date(Date.now() + this.streamingKeyTTL),
    });

    return streamingKey;
  }

  /**
   * Find streaming key in database
   */
  private async findStreamingKey(key: string, userId: string): Promise<StreamingToken | null> {
    try {
      const deterministicSalt = generateDeterministicSalt(userId, this.streamingKeySalt);
      const hashToFind = await hashKeyWithSalt(key, deterministicSalt);

      const streamingKey = await this.streamingKeyRepository.findByKeyHash(hashToFind);

      if (streamingKey && streamingKey.expiresAt > new Date()) {
        return {
          movieId: streamingKey.movieId,
          userId: streamingKey.userId.toString(),
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
