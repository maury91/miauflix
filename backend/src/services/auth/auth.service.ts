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

export class AuthService {
  private readonly userRepository: UserRepository;
  private readonly refreshTokenRepository: RefreshTokenRepository;
  private readonly secretKey: Uint8Array;
  private readonly refreshSecretKey: Uint8Array;
  private readonly issuer = "miauflix-api";
  private readonly audience = "miauflix-client";

  constructor(private readonly db: Database) {
    this.userRepository = db.getUserRepository();
    this.refreshTokenRepository = db.getRefreshTokenRepository();

    // Convert the secret to a Uint8Array for jose
    this.secretKey = new TextEncoder().encode(ENV("JWT_SECRET"));
    this.refreshSecretKey = new TextEncoder().encode(
      ENV("REFRESH_TOKEN_SECRET"),
    );
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

    return this.userRepository.create({
      email,
      passwordHash,
      role,
    });
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
