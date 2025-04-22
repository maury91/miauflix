import { compare, hash } from "bcrypt";
import type { JWTPayload } from "jose";
import { jwtVerify, SignJWT } from "jose";
import { hostname } from "os";
import { v4 as uuidv4 } from "uuid";

import { AuditEventSeverity, AuditEventType } from "@entities/audit-log.entity";
import type { User } from "@entities/user.entity";
import { UserRole } from "@entities/user.entity";
import type { Database } from "@database/database";
import { InvalidTokenError } from "@errors/auth.errors";
import type { RefreshTokenRepository } from "@repositories/refresh-token.repository";
import type { UserRepository } from "@repositories/user.repository";
import type { AuditLogService } from "@services/security/audit-log.service";
import { generateSecurePassword } from "@utils/password.util";

import { ENV } from "../../constants";

export class AuthService {
  private readonly userRepository: UserRepository;
  private readonly refreshTokenRepository: RefreshTokenRepository;
  private readonly secretKey: Uint8Array;
  private readonly refreshSecretKey: Uint8Array;
  private readonly issuer = "miauflix-api";
  private readonly audience = "miauflix-client";

  constructor(
    db: Database,
    private readonly auditLogService: AuditLogService,
  ) {
    this.userRepository = db.getUserRepository();
    this.refreshTokenRepository = db.getRefreshTokenRepository();

    // Convert the secret to a Uint8Array for jose
    this.secretKey = new TextEncoder().encode(ENV("JWT_SECRET"));
    this.refreshSecretKey = new TextEncoder().encode(
      ENV("REFRESH_TOKEN_SECRET"),
    );
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
      `Created initial admin user with email: ${adminEmail} and password: ${adminPassword}`,
    );
    console.log("Please change these credentials after first login.");
  }

  async createUser(
    email: string,
    password: string,
    role: UserRole = UserRole.USER,
  ): Promise<User> {
    const existingUser = await this.userRepository.findByEmail(email);
    if (existingUser) {
      throw new Error("User already exists");
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
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(now)
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setExpirationTime("15m")
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
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(now)
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setExpirationTime("7d")
      .sign(this.refreshSecretKey);
  }

  async verifyAccessToken(token: string) {
    try {
      const { payload } = await jwtVerify<JWTPayload & { userId: string }>(
        token,
        this.secretKey,
        {
          issuer: this.issuer,
          audience: this.audience,
        },
      );

      if (!payload.userId || !payload.email || !payload.role) {
        throw new InvalidTokenError();
      }

      return payload;
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
        },
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

    const tokenEntity = await this.refreshTokenRepository.findByToken(
      refreshTokenPayload.token,
    );

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
    const tokenEntity =
      await this.refreshTokenRepository.findByToken(refreshToken);

    if (tokenEntity) {
      await this.refreshTokenRepository.delete(tokenEntity.id);
      return tokenEntity.user;
    }

    return null;
  }
}
