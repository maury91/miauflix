import type { UserRole } from '@entities/user.entity';

import { AppError } from './base.error';

export class LoginError extends AppError {
  constructor(public email: string) {
    super('Invalid credentials', 'auth', 'invalid_credentials');
  }
}

export class RoleError extends AppError {
  constructor(
    public role: UserRole,
    public email: string
  ) {
    super('Insufficient permissions', 'auth', 'insufficient_permissions');
  }
}

export class AuthError extends AppError {
  constructor() {
    super('Authentication required', 'auth', 'unauthorized');
  }
}

export class InvalidTokenError extends AppError {
  constructor() {
    super('Invalid token', 'auth', 'invalid_token');
  }
}

export class UserAlreadyExistsError extends AppError {
  constructor() {
    super('User already exists', 'auth', 'user_already_exists');
  }
}

export class AdminAlreadyExistsError extends AppError {
  constructor() {
    super('Admin user already exists', 'auth', 'admin_already_exists');
  }
}
