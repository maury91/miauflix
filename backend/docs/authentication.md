# Authentication System

The backend uses a secure authentication system with the following features:

## Security Features

- **Whitelist Approach**: All routes are protected by default unless explicitly whitelisted
- **JWT-based Authentication**: Secure token-based authentication
- **Refresh Token Rotation**: Implements secure token refresh mechanism
- **Role-based Access Control**: Supports different user roles (USER, ADMIN)
- **Password Hashing**: Uses bcrypt for secure password storage
- **Token Expiration**: Access tokens expire after 15 minutes, refresh tokens after 7 days
- **Admin-Only User Creation**: Only administrators can create new user accounts

## Authentication Flow

1. **User Creation**: Only administrators can create new user accounts
2. **Login**: Users receive access and refresh tokens upon successful login
3. **Token Refresh**: Users can refresh their access token using their refresh token
4. **Logout**: Users can invalidate their refresh token to log out

## API Endpoints

### Public Routes (Whitelisted)

- `POST /auth/login` - Login with email and password
  - Body: `{ email: string, password: string }`
  - Returns: `{ accessToken: string, refreshToken: string }`

- `POST /auth/refresh` - Refresh access token
  - Body: `{ refreshToken: string }`
  - Returns: `{ accessToken: string, refreshToken: string }`

### Protected Routes

- `POST /auth/logout` - Logout and invalidate refresh token
  - Body: `{ refreshToken: string }`
  - Returns: `{ message: string }`

### Admin-Only Routes

- `POST /auth/users` - Create a new user (Admin only)
  - Body: `{ email: string, password: string, role: UserRole }`
  - Returns: `{ id: string, email: string, role: UserRole }`

## Environment Variables

The following environment variables are required:

```
JWT_SECRET=your-secure-secret-key
```

## Usage Example

```typescript
// Protected route example
app.get("/protected", ({ user }) => {
  return { message: `Hello ${user.email}!` };
});

// Admin-only route example
app.get("/admin", ({ user }) => {
  if (user.role !== UserRole.ADMIN) {
    throw new Error("Forbidden");
  }
  return { message: "Admin access granted" };
});
```

## Security Best Practices

1. Always use HTTPS in production
2. Store sensitive environment variables securely
3. Implement rate limiting for authentication endpoints
4. Regularly rotate JWT secrets
5. Monitor for suspicious activity
6. Implement proper error handling
7. Use secure password policies

## JWT Implementation

The authentication system uses industry-standard JWT handling, which provides:

- **Standards Compliance**: Full implementation of JWT standards
- **Advanced Security**: Support for multiple algorithms and key types
- **Fine-grained Control**: Detailed control over token claims and headers
- **Type Safety**: Excellent TypeScript support
- **Performance**: Optimized for performance with minimal dependencies 