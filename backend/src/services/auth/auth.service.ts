import { Database } from "@database/database";
import { User, UserRole } from "@entities/user.entity";
import { RefreshToken } from "@entities/refresh-token.entity";
import { compare, hash } from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import { JWTPayload, SignJWT, jwtVerify } from "jose";
import { UserRepository } from "@repositories/user.repository";
import { RefreshTokenRepository } from "@repositories/refresh-token.repository";
import { ENV } from "../../constants";
import { randomBytes } from "crypto";
import { ServiceConfiguration } from "../../types/configuration";
import { hostname } from "os";
import { AuditLogService } from "@services/audit-log.service";
import { AuditEventType, AuditEventSeverity } from "@entities/audit-log.entity";
import { generateSecurePassword } from "../../utils/password.util";

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

  async verifyAccessToken(token: string): Promise<JWTPayload> {
    try {
      const { payload } = await jwtVerify(token, this.secretKey, {
        issuer: this.issuer,
        audience: this.audience,
      });

      return payload;
    } catch (error) {
      throw new Error("Invalid token");
    }
  }

  async refreshAccessToken(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string } | null> {
    const tokenEntity =
      await this.refreshTokenRepository.findByToken(refreshToken);

    if (!tokenEntity || tokenEntity.expiresAt < new Date()) {
      return null;
    }

    // Generate new tokens
    const newTokens = await this.generateTokens(tokenEntity.user);

    // Delete the old refresh token
    await this.refreshTokenRepository.delete(tokenEntity.id);

    return newTokens;
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenEntity =
      await this.refreshTokenRepository.findByToken(refreshToken);

    if (tokenEntity) {
      await this.refreshTokenRepository.delete(tokenEntity.id);
    }
  }
}

export const jwtConfigurationDefinition: ServiceConfiguration = {
  name: "JWT Authentication",
  description: "Configuration for JWT authentication",
  variables: {
    JWT_SECRET: {
      description: "Secret key for JWT token signing",
      example: "a-random-secret-key",
      defaultValue: randomBytes(32).toString("hex"),
      required: true,
    },
    REFRESH_TOKEN_SECRET: {
      description: "Secret key for refresh token signing",
      example: "a-random-refresh-secret-key",
      defaultValue: randomBytes(32).toString("hex"),
      required: true,
    },
  },
  test: async () => {
    return;
  },
};
