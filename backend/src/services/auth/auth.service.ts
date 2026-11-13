import { logger } from '@logger';
import { password as bunPassword } from 'bun';
import { randomBytes } from 'crypto';
import type { Context } from 'hono';
import { deleteCookie } from 'hono/cookie';
import { parse } from 'hono/utils/cookie';
import type { JWTPayload } from 'jose';
import { jwtVerify, SignJWT } from 'jose';
import { hostname } from 'os';

import type { Database } from '@database/database';
import { AuditEventSeverity, AuditEventType } from '@entities/audit-log.entity';
import type { RefreshToken } from '@entities/refresh-token.entity';
import type { User } from '@entities/user.entity';
import { UserRole } from '@entities/user.entity';
import {
  AdminAlreadyExistsError,
  InvalidTokenError,
  UserAlreadyExistsError,
} from '@errors/auth.errors';
import type { ConfigService, ServiceInstanceStatus } from '@mytypes/configuration';
import type { UserDto } from '@mytypes/user.types';
import type { RefreshTokenRepository } from '@repositories/refresh-token.repository';
import type { StreamingKeyRepository } from '@repositories/streaming-key.repository';
import type { UserRepository } from '@repositories/user.repository';
import type { StreamingToken } from '@services/auth/auth.types';
import { randomAvatar } from '@services/profile/random-avatar.util';
import type { AuditLogService } from '@services/security/audit-log.service';
import { readRefreshTokenPairs } from '@utils/auth-transport.util';
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
import { toUserDto } from './user-dto.util';

/** How many of the sessions a device holds `/auth/sessions` validates: one per profile on a shared TV. */
export const MAX_LISTED_SESSIONS = 8;

/**
 * A rotated refresh token presented again this soon after its rotation is taken for a request
 * that raced the rotation (two tabs refreshing at once) and only refused; later, the session is
 * revoked, since only a copy of the token can still be using it.
 */
export const REFRESH_REUSE_GRACE_MS = 30_000;

/** How long a session check for an access token is trusted before the database is asked again. */
export const SESSION_CHECK_TTL_MS = 5_000;

/** Who a valid access token acts as: the session must still exist, and the role is the current one. */
export interface ActiveSession {
  userId: string;
  sessionId: string;
  email: string;
  role: UserRole;
}

/** A session, or every session of a user, was revoked or may have changed. */
export interface SessionRevocation {
  userId: string;
  session: string;
}

/** A session lookup, cached for `SESSION_CHECK_TTL_MS`; `revoked` is set if its session goes meanwhile. */
interface SessionCheck {
  until: number;
  session: Promise<ActiveSession | null>;
  revoked?: boolean;
}

/** bcrypt only reads this many bytes of a password. */
const BCRYPT_MAX_PASSWORD_BYTES = 72;

const hashPassword = (password: string): Promise<string> =>
  bunPassword.hash(password, { algorithm: 'bcrypt', cost: 10 });

/**
 * Bun pre-hashes passwords longer than bcrypt's 72 bytes, while the `bcrypt` package used before
 * truncated them. A hash made that way still matches its password's first 72 bytes.
 */
const verifyPassword = async (password: string, passwordHash: string): Promise<boolean> => {
  if (await bunPassword.verify(password, passwordHash)) return true;
  const bytes = new TextEncoder().encode(password);
  return (
    bytes.length > BCRYPT_MAX_PASSWORD_BYTES &&
    bunPassword.verify(bytes.subarray(0, BCRYPT_MAX_PASSWORD_BYTES), passwordHash)
  );
};

// This is used to prevent enumerating existing emails by checking the response time
let dummyPasswordHash: Promise<string> | null = null;
const getDummyPasswordHash = (): Promise<string> =>
  (dummyPasswordHash ??= hashPassword(randomBytes(16).toString('base64url')));

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

export interface UserSession {
  session: string;
  user: UserDto;
}

export class AuthService {
  private readonly userRepository: UserRepository;
  private readonly refreshTokenRepository: RefreshTokenRepository;
  private readonly streamingKeyRepository: StreamingKeyRepository;
  private secretKey: Uint8Array;
  private readonly issuer = 'miauflix-api';
  private readonly audience = 'miauflix-client';
  private streamingKeyTTL: number;
  private streamingKeySalt: string;
  private readonly streamingKeyCache = new InMemoryCache<StreamingToken>();
  private readonly sessionChecks = new Map<string, SessionCheck>();
  /**
   * Lookups that have not settled yet, by `userId:session`, kept apart from the cache (whose
   * entries can be replaced or swept) so a revocation reaches every one of them.
   */
  private readonly pendingSessionChecks = new Map<string, Set<SessionCheck>>();
  private readonly revocationListeners = new Set<(revocation: SessionRevocation) => void>();

  // Configuration
  private allowCreateAdminOnFirstRun: boolean;
  private refreshTokenTTL: number;
  private accessTokenTTL: number;
  private refreshTokenMaxRefreshDays: number;
  private maxDeviceSlotsPerUser: number;
  private cookieName: string;
  private accessTokenCookieName: string;
  private cookieDomain?: string;
  private cookieSecure: boolean;
  private readonly config: ConfigService;

  testable = false;
  getStatus(): ServiceInstanceStatus {
    return { status: 'ready' };
  }

  constructor(
    db: Database,
    private readonly auditLogService: AuditLogService,
    config: ConfigService
  ) {
    this.config = config;
    this.userRepository = db.getUserRepository();
    this.refreshTokenRepository = db.getRefreshTokenRepository();
    this.streamingKeyRepository = db.getStreamingKeyRepository();
    config.registerService('JWT', this);

    // Convert the secret to a Uint8Array for jose
    this.secretKey = new TextEncoder().encode(config.getOrThrow('JWT_SECRET'));

    // Configuration
    this.allowCreateAdminOnFirstRun = config.getOrThrow('ALLOW_CREATE_ADMIN_ON_FIRST_RUN');
    this.streamingKeyTTL = config.getOrThrow('STREAM_TOKEN_EXPIRATION');
    this.streamingKeySalt = config.getOrThrow('STREAM_KEY_SALT');
    this.refreshTokenTTL = config.getOrThrow('REFRESH_TOKEN_EXPIRATION');
    this.accessTokenTTL = config.getOrThrow('ACCESS_TOKEN_EXPIRATION');
    this.refreshTokenMaxRefreshDays = config.getOrThrow('REFRESH_TOKEN_MAX_REFRESH_DAYS');
    this.maxDeviceSlotsPerUser = config.getOrThrow('MAX_DEVICE_SLOTS_PER_USER');
    this.cookieName = config.getOrThrow('REFRESH_TOKEN_COOKIE_NAME');
    this.accessTokenCookieName = config.getOrThrow('ACCESS_TOKEN_COOKIE_NAME');
    this.cookieDomain = config.get('COOKIE_DOMAIN') || undefined;
    this.cookieSecure = config.getOrThrow('COOKIE_SECURE');
  }

  async reload(): Promise<void> {
    this.secretKey = new TextEncoder().encode(this.config.getOrThrow('JWT_SECRET'));
    this.allowCreateAdminOnFirstRun = this.config.getOrThrow('ALLOW_CREATE_ADMIN_ON_FIRST_RUN');
    this.streamingKeyTTL = this.config.getOrThrow('STREAM_TOKEN_EXPIRATION');
    this.streamingKeySalt = this.config.getOrThrow('STREAM_KEY_SALT');
    this.refreshTokenTTL = this.config.getOrThrow('REFRESH_TOKEN_EXPIRATION');
    this.accessTokenTTL = this.config.getOrThrow('ACCESS_TOKEN_EXPIRATION');
    this.refreshTokenMaxRefreshDays = this.config.getOrThrow('REFRESH_TOKEN_MAX_REFRESH_DAYS');
    this.maxDeviceSlotsPerUser = this.config.getOrThrow('MAX_DEVICE_SLOTS_PER_USER');
    this.cookieName = this.config.getOrThrow('REFRESH_TOKEN_COOKIE_NAME');
    this.accessTokenCookieName = this.config.getOrThrow('ACCESS_TOKEN_COOKIE_NAME');
    this.cookieDomain = this.config.get('COOKIE_DOMAIN') || undefined;
    this.cookieSecure = this.config.getOrThrow('COOKIE_SECURE');
  }

  /**
   * Configures initial admin user if none exists.
   * Skipped when ALLOW_CREATE_ADMIN_ON_FIRST_RUN is enabled — admin is created via POST /auth/setup.
   */
  @traced('AuthService')
  async configureUsers(): Promise<void> {
    if (this.allowCreateAdminOnFirstRun) {
      return;
    }

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

    logger.info(
      'Auth',
      `Created initial admin user with email: ${adminEmail} and password: ${adminPassword}`
    );
    logger.info('Auth', 'Please change these credentials after first login.');
  }

  /**
   * Creates the first admin user via the setup endpoint.
   * Returns null when the feature flag is disabled (caller should return 404).
   * Throws when an admin already exists (caller should return 404).
   * The check and insert are atomic (single transaction) to prevent race conditions.
   */
  @traced('AuthService')
  async setupAdmin(email: string, password: string, context: Context): Promise<User | null> {
    if (!this.allowCreateAdminOnFirstRun) {
      return null;
    }
    const passwordHash = await hashPassword(password);
    const newUser = await this.userRepository.createAdminIfNone({
      email,
      passwordHash,
      role: UserRole.ADMIN,
      avatar: randomAvatar(),
    });
    if (!newUser) {
      throw new AdminAlreadyExistsError();
    }
    await this.auditLogService.logSecurityEvent({
      eventType: AuditEventType.USER_CREATION,
      severity: AuditEventSeverity.INFO,
      description: `User created with role: ${UserRole.ADMIN}`,
      userEmail: email,
      context,
      metadata: { role: UserRole.ADMIN, isEmailVerified: false },
    });
    return newUser;
  }

  async isSetupAvailable(): Promise<boolean> {
    if (!this.allowCreateAdminOnFirstRun) return false;
    const admins = await this.userRepository.findByRole(UserRole.ADMIN);
    return admins.length === 0;
  }

  @traced('AuthService')
  async createUser(
    email: string,
    password: string,
    role: UserRole = UserRole.USER,
    profile: Pick<Partial<User>, 'avatar' | 'displayName'> = {}
  ): Promise<User> {
    const existingUser = await this.userRepository.findByEmail(email);
    if (existingUser) {
      throw new UserAlreadyExistsError();
    }

    const passwordHash = await hashPassword(password);

    const newUser = await this.userRepository.create({
      email,
      passwordHash,
      role,
      displayName: profile.displayName ?? null,
      // Generated once, so every profile has a Plushie from the start
      avatar: profile.avatar ?? randomAvatar(),
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
    if (!user) {
      await verifyPassword(password, await getDummyPasswordHash());
      return null;
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    return isValid ? user : null;
  }

  @traced('AuthService')
  private async generateSession(): Promise<string> {
    // Always generate cryptographically secure random session ID
    return randomBytes(16).toString('base64url'); // Length is 22 characters (16 bytes * 4/3)
  }

  @traced('AuthService')
  async generateTokens(user: User, context: Context): Promise<AuthResult> {
    const ipAddress =
      getRealClientIp(context, this.config.get('REVERSE_PROXY_SECRET') ?? '') || 'unknown';
    const userAgent = context.req.header('user-agent');

    // Always generate fresh session for security (prevents enumeration attacks)
    const session = await this.generateSession();

    // Generate tokens
    const accessToken = await this.generateAccessToken(user, session);
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
      user: toUserDto(user),
    };
  }

  async revokeSession(userId: string, session: string): Promise<boolean> {
    const revoked = await this.refreshTokenRepository.deleteByUserAndSession(userId, session);
    this.sessionRevoked({ userId, session });
    return revoked;
  }

  /** Called when a session is revoked. */
  onSessionRevoked(listener: (revocation: SessionRevocation) => void): () => void {
    this.revocationListeners.add(listener);
    return () => this.revocationListeners.delete(listener);
  }

  private sessionRevoked(revocation: SessionRevocation): void {
    const key = `${revocation.userId}:${revocation.session}`;
    const cached = this.sessionChecks.get(key);
    if (cached) cached.revoked = true;
    this.sessionChecks.delete(key);
    // Lookups already in flight must not hand out the session once they settle
    for (const check of this.pendingSessionChecks.get(key) ?? []) check.revoked = true;
    for (const listener of this.revocationListeners) listener(revocation);
  }

  /**
   * The session an access token belongs to, if it still exists: access tokens are revoked with
   * their session (logout, refresh-token reuse, device slot eviction) instead of living out their
   * expiry, and the role is read from the user rather than the token. Cached for a few seconds;
   * revocations in this process clear the cache at once.
   */
  async resolveSession(userId: string, sessionId: string): Promise<ActiveSession | null> {
    const key = `${userId}:${sessionId}`;
    const now = Date.now();
    const cached = this.sessionChecks.get(key);
    if (cached && cached.until > now) return this.unlessRevoked(cached);
    if (this.sessionChecks.size > 10_000) {
      for (const [entry, check] of this.sessionChecks)
        if (check.until <= now) this.sessionChecks.delete(entry);
    }
    const session = this.refreshTokenRepository
      .findByUserAndSession(userId, sessionId)
      .then(token =>
        token?.user && token.expiresAt > new Date()
          ? { userId, sessionId, email: token.user.email, role: token.user.role }
          : null
      );
    const check: SessionCheck = { until: now + SESSION_CHECK_TTL_MS, session };
    this.sessionChecks.set(key, check);
    const pending = this.pendingSessionChecks.get(key) ?? new Set<SessionCheck>();
    pending.add(check);
    this.pendingSessionChecks.set(key, pending);
    return this.unlessRevoked(check)
      .catch(error => {
        if (this.sessionChecks.get(key) === check) this.sessionChecks.delete(key);
        throw error;
      })
      .finally(() => {
        pending.delete(check);
        if (pending.size === 0 && this.pendingSessionChecks.get(key) === pending)
          this.pendingSessionChecks.delete(key);
      });
  }

  /** A lookup's result, or null when its session was revoked while it was in flight. */
  private async unlessRevoked(check: SessionCheck): Promise<ActiveSession | null> {
    const session = await check.session;
    return check.revoked ? null : session;
  }

  /** An access token that is valid, names the session it is sent for, and whose session still exists. */
  async authenticateAccessToken(token: string, sessionId: string): Promise<ActiveSession> {
    const payload = await this.verifyAccessToken(token);
    if (payload.sessionId !== sessionId) throw new InvalidTokenError();
    const session = await this.resolveSession(payload.userId, sessionId);
    if (!session) throw new InvalidTokenError();
    return session;
  }

  @traced('AuthService')
  private async generateAccessToken(user: User, session: string): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    // Calculate expiration time in seconds (accessTokenTTL is in milliseconds)
    const expirationTime = now + Math.floor(this.accessTokenTTL / 1000);

    return new SignJWT({
      userId: user.id,
      email: user.email,
      role: user.role,
      sid: session,
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
      const evicted = await this.refreshTokenRepository.deleteOldestByUser(user.id);
      if (evicted) this.sessionRevoked({ userId: user.id, session: evicted });
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
      // Tokens from before session binding have no `sid`; they are refused and the client refreshes
      const sessionId = (payload as { sid?: unknown }).sid;
      if (typeof sessionId !== 'string' || !sessionId) throw new InvalidTokenError();

      return {
        userId,
        email,
        role: role as UserRole,
        sessionId,
      };
    } catch {
      throw new InvalidTokenError();
    }
  }

  @traced('AuthService')
  async verifyOpaqueRefreshToken(opaqueToken: string, session: string): Promise<RefreshToken> {
    const refreshToken = await this.refreshTokenRepository.findByToken(opaqueToken, session);

    if (!refreshToken) {
      await this.detectRefreshTokenReuse(opaqueToken, session);
      throw new InvalidTokenError();
    }

    // Check if token has expired
    if (refreshToken.expiresAt < new Date()) {
      // Clean up expired token
      await this.refreshTokenRepository.delete(refreshToken.id);
      this.sessionRevoked({ userId: refreshToken.userId, session });
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
      this.sessionRevoked({ userId: refreshToken.userId, session: refreshToken.session });
      throw new InvalidTokenError();
    }

    return refreshToken;
  }

  /**
   * A refresh token that is no longer the session's current one but was its previous one has been
   * copied: whoever rotated it holds the session now. Past a short grace for racing refreshes the
   * session is revoked, so neither copy can be used again.
   */
  private async detectRefreshTokenReuse(opaqueToken: string, session: string): Promise<void> {
    const reused = await this.refreshTokenRepository.findByPreviousToken(opaqueToken, session);
    if (!reused) return;
    if (reused.rotatedAt && Date.now() - reused.rotatedAt.getTime() < REFRESH_REUSE_GRACE_MS) {
      return;
    }
    await this.refreshTokenRepository.deleteByUserAndSession(reused.userId, session);
    this.sessionRevoked({ userId: reused.userId, session });
    const user = await this.userRepository.findById(reused.userId);
    await this.auditLogService.logSecurityEvent({
      eventType: AuditEventType.SUSPICIOUS_ACTIVITY,
      severity: AuditEventSeverity.CRITICAL,
      description: 'Refresh token reuse detected - session revoked',
      userEmail: user?.email,
      metadata: {
        originalIssueIp: reused.issueIpAddress,
        lastIp: reused.lastIpAddress,
        rotatedAt: reused.rotatedAt?.toISOString(),
      },
    });
  }

  @traced('AuthService')
  async refreshTokens(
    opaqueToken: string,
    session: string,
    context: Context
  ): Promise<AuthResult | null> {
    try {
      const ipAddress =
        getRealClientIp(context, this.config.get('REVERSE_PROXY_SECRET') ?? '') || 'unknown';
      const userAgent = context.req.header('user-agent');

      // Verify the refresh token
      const refreshToken = await this.verifyOpaqueRefreshToken(opaqueToken, session);

      // Generate new access token
      const newAccessToken = await this.generateAccessToken(refreshToken.user, session);

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
        user: toUserDto(refreshToken.user),
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
    this.sessionRevoked({ userId: refreshToken.userId, session });

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
      user: toUserDto(user),
    };
  }

  /**
   * Discover and validate sessions from refresh token cookies in the request
   * Returns valid sessions found in the request cookies
   */
  @traced('AuthService')
  async getSessionsFromCookies(context: Context): Promise<UserSession[]> {
    const cookieHeader = context.req.raw.headers.get('cookie');
    // Token-transport clients (the TV app) send their refresh tokens instead of cookies
    const headerTokens = readRefreshTokenPairs(context);
    if (!cookieHeader && !headerTokens.length) {
      return [];
    }

    // Parse all cookies using Hono's parse function
    const cookies = parse(cookieHeader ?? '');

    // Filter cookies that start with refresh token prefix and extract sessions
    const refreshTokenPrefix = `${this.cookieName}_`;
    const refreshTokenCookies = Object.entries(cookies)
      .filter(([name]) => name.startsWith(refreshTokenPrefix))
      .map(([name, value]) => ({
        session: name.substring(refreshTokenPrefix.length),
        token: value,
      }))
      .filter(({ session, token }) => session && token)
      .sort((left, right) => {
        const leftHasAccessToken = Boolean(
          cookies[`${this.accessTokenCookieName}_${left.session}`]
        );
        const rightHasAccessToken = Boolean(
          cookies[`${this.accessTokenCookieName}_${right.session}`]
        );
        return Number(rightHasAccessToken) - Number(leftHasAccessToken);
      });

    // Validate each refresh token and collect valid sessions
    const verifiedSessions = await Promise.all(
      // Keep validation work bounded while prioritizing the currently active browser sessions.
      [...refreshTokenCookies, ...headerTokens]
        .slice(0, MAX_LISTED_SESSIONS)
        .map(async ({ session, token }) => {
          try {
            const refreshToken = await this.verifyOpaqueRefreshToken(token, session);
            const user = await this.userRepository.findById(refreshToken.userId);
            if (user) {
              return {
                session,
                user: toUserDto(user),
              };
            }
          } catch {
            this.clearCookies(context, session);
            return null;
          }

          this.clearCookies(context, session);
          return null;
        })
    );

    return verifiedSessions.filter((session): session is UserSession => session !== null);
  }

  /** Name prefixes of the session cookies (`<prefix>_<session>`). */
  getSessionCookiePrefixes(): string[] {
    return [this.cookieName, this.accessTokenCookieName];
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

  clearCookies(context: Context, session: string): void {
    const {
      name: refreshCookieName,
      domain: refreshCookieDomain,
      path: refreshCookiePath,
    } = this.getCookieConfig(session);
    const {
      name: accessCookieName,
      domain: accessCookieDomain,
      path: accessCookiePath,
    } = this.getAccessTokenCookieConfig(session);

    deleteCookie(context, refreshCookieName, {
      domain: refreshCookieDomain,
      path: refreshCookiePath,
    });
    deleteCookie(context, accessCookieName, {
      domain: accessCookieDomain,
      path: accessCookiePath,
    });
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
  private async findStreamingKey(
    key: string,
    userId: string
  ): Promise<(StreamingToken & { expiresAt: Date }) | null> {
    try {
      const deterministicSalt = generateDeterministicSalt(userId, this.streamingKeySalt);
      const hashToFind = await hashKeyWithSalt(key, deterministicSalt);

      const streamingKey = await this.streamingKeyRepository.findByKeyHash(hashToFind);

      if (streamingKey && streamingKey.expiresAt > new Date()) {
        return {
          movieId: streamingKey.movieId,
          userId: streamingKey.userId,
          expiresAt: streamingKey.expiresAt,
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
    const found = await this.findStreamingKey(randomKey, userId);
    if (found) {
      const { expiresAt, ...streamingKey } = found;
      // Cache the successful result until the key itself expires, never past it
      this.streamingKeyCache.set(key, streamingKey, expiresAt.getTime());

      return streamingKey;
    }

    throw new InvalidTokenError();
  }
}
