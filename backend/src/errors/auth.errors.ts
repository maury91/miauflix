import type { UserRole } from '@entities/user.entity';

export class LoginError extends Error {
  constructor(public email: string) {
    super('Invalid credentials');
  }
}

export class RoleError extends Error {
  constructor(
    public role: UserRole,
    public email: string
  ) {
    super('Insufficient permissions');
  }
}

export class AuthError extends Error {
  constructor() {
    super('Authentication required');
  }
}

export class InvalidTokenError extends Error {
  constructor() {
    super('Invalid token');
  }
}
