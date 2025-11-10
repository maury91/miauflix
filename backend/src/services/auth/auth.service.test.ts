import type { Context } from 'hono';

import type { Database } from '@database/database';
import { AuditEventSeverity, AuditEventType } from '@entities/audit-log.entity';
import type { RefreshToken } from '@entities/refresh-token.entity';
import type { User } from '@entities/user.entity';
import { UserRole } from '@entities/user.entity';
import { InvalidTokenError } from '@errors/auth.errors';
import type { RefreshTokenRepository } from '@repositories/refresh-token.repository';
import type { StreamingKeyRepository } from '@repositories/streaming-key.repository';
import type { UserRepository } from '@repositories/user.repository';
import type { AuditLogService } from '@services/security/audit-log.service';

import { AuthService } from './auth.service';

// Mock the ENV function - must be hoisted
jest.mock('@constants');

// Mock the tracing decorator
jest.mock('@utils/tracing.util', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  traced: () => (target: any, propertyKey: string, descriptor: PropertyDescriptor) => descriptor,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tracedApi: () => (target: any, propertyKey: string, descriptor: PropertyDescriptor) => descriptor,
}));

// Mock jose library
jest.mock('jose', () => ({
  SignJWT: jest.fn().mockImplementation(() => ({
    setProtectedHeader: jest.fn().mockReturnThis(),
    setIssuedAt: jest.fn().mockReturnThis(),
    setIssuer: jest.fn().mockReturnThis(),
    setAudience: jest.fn().mockReturnThis(),
    setExpirationTime: jest.fn().mockReturnThis(),
    sign: jest.fn().mockResolvedValue('mocked-jwt-token'),
  })),
  jwtVerify: jest.fn().mockResolvedValue({
    payload: { userId: 'user-123', email: 'test@example.com', role: 'USER' },
  }),
}));

// Mock bcrypt
jest.mock('bcrypt', () => ({
  compare: jest.fn(),
}));

// Mock proxy utility
jest.mock('@utils/proxy.util', () => ({
  getRealClientIp: jest.fn().mockReturnValue('192.168.1.1'),
}));

// Mock JWT secret for testing
const jwtSecret = 'test-jwt-secret-key-for-hmac-sha256';

describe('AuthService', () => {
  let authService: AuthService;
  let mockDatabase: jest.Mocked<Database>;
  let mockUserRepository: jest.Mocked<UserRepository>;
  let mockRefreshTokenRepository: jest.Mocked<RefreshTokenRepository>;
  let mockStreamingKeyRepository: jest.Mocked<StreamingKeyRepository>;
  let mockAuditLogService: jest.Mocked<AuditLogService>;
  let mockContext: Context;

  // Get the mocked ENV function
  const { ENV } = jest.requireMock('@constants');

  const setupTest = () => {
    // Create mock repositories
    mockUserRepository = {
      findByEmail: jest.fn(),
      findByRole: jest.fn(),
      create: jest.fn(),
    } as unknown as jest.Mocked<UserRepository>;

    mockRefreshTokenRepository = {
      findByToken: jest.fn(),
      create: jest.fn(),
      updateToken: jest.fn(),
      isChainExpired: jest.fn(),
      delete: jest.fn(),
      countByUser: jest.fn(),
      deleteOldestByUser: jest.fn(),
      deleteByUserAndSession: jest.fn(),
    } as unknown as jest.Mocked<RefreshTokenRepository>;

    mockStreamingKeyRepository = {} as unknown as jest.Mocked<StreamingKeyRepository>;

    mockDatabase = {
      getUserRepository: jest.fn(() => mockUserRepository),
      getRefreshTokenRepository: jest.fn(() => mockRefreshTokenRepository),
      getStreamingKeyRepository: jest.fn(() => mockStreamingKeyRepository),
    } as unknown as jest.Mocked<Database>;

    mockAuditLogService = {
      logSecurityEvent: jest.fn(),
    } as unknown as jest.Mocked<AuditLogService>;

    // Create mock context
    mockContext = {
      req: {
        header: jest.fn(),
      },
    } as unknown as Context;

    return {
      authService: new AuthService(mockDatabase, mockAuditLogService),
      mockUserRepository,
      mockRefreshTokenRepository,
      mockAuditLogService,
      mockContext,
    };
  };

  beforeEach(() => {
    // Mock ENV to return test configuration
    ENV.mockImplementation((key: string) => {
      const config = {
        JWT_SECRET: jwtSecret,
        REFRESH_TOKEN_EXPIRATION: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
        ACCESS_TOKEN_EXPIRATION: 15 * 60 * 1000, // 15 minutes in ms
        REFRESH_TOKEN_MAX_REFRESH_DAYS: 30,
        MAX_DEVICE_SLOTS_PER_USER: 5,
        REFRESH_TOKEN_COOKIE_NAME: '__test_rt',
        ACCESS_TOKEN_COOKIE_NAME: '__test_at',
        COOKIE_SECURE: true,
        STREAM_TOKEN_EXPIRATION: 21600000, // 6 hours in ms
        STREAM_KEY_SALT: 'test-salt',
      };
      return config[key as keyof typeof config];
    });

    const setup = setupTest();
    authService = setup.authService;
    mockUserRepository = setup.mockUserRepository;
    mockRefreshTokenRepository = setup.mockRefreshTokenRepository;
    mockAuditLogService = setup.mockAuditLogService;
    mockContext = setup.mockContext;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateUser', () => {
    it('should validate user with correct credentials', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        passwordHash: '$2b$10$example.hash',
        role: UserRole.USER,
      } as User;

      mockUserRepository.findByEmail.mockResolvedValue(mockUser);

      // Mock bcrypt compare to return true
      const bcrypt = jest.requireMock('bcrypt');
      bcrypt.compare.mockResolvedValue(true);

      const result = await authService.validateUser('test@example.com', 'password');

      expect(result).toEqual(mockUser);
      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith('test@example.com');
    });

    it('should return null for invalid credentials', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        passwordHash: '$2b$10$example.hash',
        role: UserRole.USER,
      } as User;

      mockUserRepository.findByEmail.mockResolvedValue(mockUser);

      // Mock bcrypt compare to return false
      const bcrypt = jest.requireMock('bcrypt');
      bcrypt.compare.mockResolvedValue(false);

      const result = await authService.validateUser('test@example.com', 'wrong-password');

      expect(result).toBeNull();
    });

    it('should return null for non-existent user', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(null);

      const result = await authService.validateUser('nonexistent@example.com', 'password');

      expect(result).toBeNull();
    });
  });

  describe('generateTokens', () => {
    it('should generate access and refresh tokens with device tracking', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        role: UserRole.USER,
      } as User;

      const userAgent = 'Mozilla/5.0...';

      mockRefreshTokenRepository.countByUser.mockResolvedValue(0);
      mockRefreshTokenRepository.create.mockResolvedValue({} as RefreshToken);

      // Mock user-agent header before calling generateTokens
      (mockContext.req.header as jest.Mock).mockImplementation((name: string) => {
        if (name === 'user-agent') {
          return userAgent;
        }
        return undefined;
      });

      const result = await authService.generateTokens(mockUser, mockContext);

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.session).toBeDefined();
      expect(result.user).toMatchObject({
        id: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
      });

      expect(mockRefreshTokenRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUser.id,
          session: result.session,
          userAgent,
          lastIpAddress: '192.168.1.1',
          issueIpAddress: '192.168.1.1',
          lastAccessedAt: expect.any(Date),
          accessCount: 1,
        })
      );
    });
  });

  describe('verifyOpaqueRefreshToken', () => {
    it('should verify valid refresh token', async () => {
      const mockRefreshToken = {
        id: 'token-123',
        tokenHash: 'hashed-token',
        userId: 'user-123',
        session: 'session_abc123',
        expiresAt: new Date(Date.now() + 86400000), // 1 day from now
        userAgent: 'test-user-agent',
        lastIpAddress: '192.168.1.1',
        lastAccessedAt: new Date(),
        accessCount: 1,
        issueIpAddress: '192.168.1.1',
        user: { email: 'test@example.com' } as User,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as RefreshToken;

      mockRefreshTokenRepository.findByToken.mockResolvedValue(mockRefreshToken);

      const result = await authService.verifyOpaqueRefreshToken('opaque-token', 'session_abc123');

      expect(result).toEqual(mockRefreshToken);
    });

    it('should throw InvalidTokenError for expired token', async () => {
      const mockRefreshToken = {
        id: 'token-123',
        tokenHash: 'hashed-token',
        userId: 'user-123',
        session: 'session_abc123',
        expiresAt: new Date(Date.now() - 86400000), // 1 day ago
        userAgent: 'test-user-agent',
        lastIpAddress: '192.168.1.1',
        lastAccessedAt: new Date(),
        accessCount: 1,
        issueIpAddress: '192.168.1.1',
        user: { email: 'test@example.com' } as User,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as RefreshToken;

      mockRefreshTokenRepository.findByToken.mockResolvedValue(mockRefreshToken);
      mockRefreshTokenRepository.delete.mockResolvedValue(true);

      await expect(
        authService.verifyOpaqueRefreshToken('opaque-token', 'session_abc123')
      ).rejects.toThrow(InvalidTokenError);

      expect(mockRefreshTokenRepository.delete).toHaveBeenCalledWith('token-123');
    });

    it('should throw InvalidTokenError for expired chain', async () => {
      const mockRefreshToken = {
        id: 'token-123',
        tokenHash: 'hashed-token',
        userId: 'user-123',
        session: 'session_abc123',
        expiresAt: new Date(Date.now() + 86400000), // Token not expired
        userAgent: 'test-user-agent',
        lastIpAddress: '192.168.1.1',
        lastAccessedAt: new Date(),
        accessCount: 1,
        issueIpAddress: '192.168.1.1',
        user: { email: 'test@example.com' } as User,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as RefreshToken;

      mockRefreshTokenRepository.findByToken.mockResolvedValue(mockRefreshToken);
      mockRefreshTokenRepository.isChainExpired.mockResolvedValue(true); // Chain is expired
      mockRefreshTokenRepository.deleteByUserAndSession.mockResolvedValue(true);

      await expect(
        authService.verifyOpaqueRefreshToken('opaque-token', 'session_abc123')
      ).rejects.toThrow(InvalidTokenError);

      expect(mockRefreshTokenRepository.isChainExpired).toHaveBeenCalledWith(
        'user-123',
        'session_abc123',
        30 // REFRESH_TOKEN_MAX_REFRESH_DAYS
      );
      expect(mockRefreshTokenRepository.deleteByUserAndSession).toHaveBeenCalledWith(
        'user-123',
        'session_abc123'
      );
    });
  });

  describe('refreshTokens', () => {
    it('should successfully refresh tokens with atomic update', async () => {
      const mockRefreshToken = {
        id: 'token-123',
        tokenHash: 'hashed-old-token',
        userId: 'user-123',
        session: 'session_test123',
        expiresAt: new Date(Date.now() + 86400000),
        userAgent: 'test-user-agent',
        lastIpAddress: '192.168.1.1',
        lastAccessedAt: new Date(),
        accessCount: 1,
        issueIpAddress: '192.168.1.1',
        user: {
          id: 'user-123',
          email: 'test@example.com',
          role: UserRole.USER,
        } as User,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as RefreshToken;

      mockRefreshTokenRepository.findByToken.mockResolvedValue(mockRefreshToken);
      mockRefreshTokenRepository.isChainExpired.mockResolvedValue(false);
      mockRefreshTokenRepository.updateToken.mockResolvedValue(true); // Success

      // Mock user-agent header
      (mockContext.req.header as jest.Mock).mockImplementation((name: string) => {
        if (name === 'user-agent') {
          return 'Mozilla/5.0...';
        }
        return undefined;
      });

      const result = await authService.refreshTokens('old-token', 'session_test123', mockContext);

      expect(result).toBeTruthy();
      expect(result?.accessToken).toBeDefined();
      expect(result?.refreshToken).toBeDefined();
      expect(result?.refreshToken).not.toBe('old-token'); // New token
      expect(result?.session).toBe('session_test123'); // Uses the passed session ID
      expect(result?.user).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        role: UserRole.USER,
      });

      expect(mockRefreshTokenRepository.updateToken).toHaveBeenCalledWith(
        'old-token',
        expect.any(String), // New token
        'user-123',
        'session_test123', // Session
        expect.any(Date), // New expiry
        '192.168.1.1', // Last IP address
        'Mozilla/5.0...' // User agent
      );
    });

    it('should detect race condition and log security event', async () => {
      const mockRefreshToken = {
        id: 'token-123',
        tokenHash: 'hashed-old-token',
        userId: 'user-123',
        session: 'session_test456',
        expiresAt: new Date(Date.now() + 86400000),
        userAgent: 'test-user-agent',
        lastIpAddress: '192.168.1.1',
        lastAccessedAt: new Date(),
        accessCount: 1,
        issueIpAddress: '192.168.1.1',
        user: {
          email: 'test@example.com',
        } as User,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as RefreshToken;

      mockRefreshTokenRepository.findByToken.mockResolvedValue(mockRefreshToken);
      mockRefreshTokenRepository.isChainExpired.mockResolvedValue(false);
      mockRefreshTokenRepository.updateToken.mockResolvedValue(false); // Race condition

      // Mock user-agent header for this test
      (mockContext.req.header as jest.Mock).mockImplementation((name: string) => {
        if (name === 'user-agent') {
          return 'Mozilla/5.0...';
        }
        return undefined;
      });

      const result = await authService.refreshTokens('old-token', 'session_test456', mockContext);

      expect(result).toBeNull();
      expect(mockAuditLogService.logSecurityEvent).toHaveBeenCalledWith({
        eventType: AuditEventType.SUSPICIOUS_ACTIVITY,
        severity: AuditEventSeverity.CRITICAL,
        description: 'Refresh token reuse detected - token already updated',
        userEmail: 'test@example.com',
        metadata: expect.objectContaining({
          originalIssueIp: '192.168.1.1',
          reuseIp: '192.168.1.1',
          userAgent: 'Mozilla/5.0...',
        }),
      });
    });
  });

  describe('getCookieConfig', () => {
    it('should return correct cookie configuration', () => {
      const config = authService.getCookieConfig('test_session_123');

      expect(config).toEqual({
        name: '__test_rt_test_session_123',
        domain: undefined, // COOKIE_DOMAIN is not set in test
        secure: true,
        httpOnly: true,
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
        path: '/api/auth/',
      });
    });
  });
});
