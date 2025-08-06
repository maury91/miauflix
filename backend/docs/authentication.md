# Authentication System

### Overview

Miauflix uses a **hybrid authentication model**: local e-mail/password accounts (**required**) with an optional Trakt.tv link (**one per user**).  
Authentication is enforced with the `authGuard` middleware **only on routes that need it**; a few endpoints remain public (see list below).

## Security Features

- **Hybrid Authentication Model**: Local accounts with optional Trakt linking [ TODO ]
- **JWT-based Authentication**: Secure token-based authentication
- **Refresh Token Rotation**: Implements secure token refresh mechanism
- **Role-based Access Control**: Supports different user roles (USER, ADMIN)
- **Password Hashing**: Uses bcrypt for secure password storage
- **Token Expiration**: Access tokens expire after 15 minutes, refresh tokens after 7 days
- **Admin-Only User Creation**: Only administrators can create new user accounts

## Authentication Flow

| Flow                        | Endpoint(s)                                                 | Notes                                                   |
| --------------------------- | ----------------------------------------------------------- | ------------------------------------------------------- |
| **E-mail + Password login** | `POST /auth/login`                                          | Returns `{ accessToken, refreshToken, expiresIn }`.     |
| **Token refresh**           | `POST /auth/refresh`                                        | Body `{ token }`.                                       |
| **Logout**                  | `POST /auth/logout`                                         | Invalidates refresh token server-side.                  |
| **Trakt device-code link**  | `POST /trakt/auth/device` → `POST /trakt/auth/device/check` | Requires existing JWT; links exactly one Trakt account. |

**Account creation** – only an **admin** may create users via `POST /auth/users`; self-registration is disabled.

#### JWT Details

- Access token TTL · **15 min** (`ACCESS_TOKEN_TTL`)
- Refresh token TTL · **7 days** (`REFRESH_TOKEN_TTL`)
- Algorithm · **HS256** (`JWT_SECRET`)

#### Protecting Routes

```ts
import { authGuard } from '@/middleware/authGuard';

app.get('/api/secure', authGuard(), c => c.json({ ok: true }));
```

**Public endpoints** (no guard):  
`POST /auth/login`, `/auth/refresh`, `/auth/logout`,  
`POST /trakt/auth/device`, `/trakt/auth/device/check`,  
`GET /health`.

All other routes must opt-in to `authGuard` if they need authentication.

## API Endpoints

#### Device-Code Link (Trakt) [ TODO ]

1. Front-end `POST /trakt/auth/device` → `{ userCode, verification_url, interval }`.
2. Display QR (to `verification_url`) + 6-digit `userCode`.
3. Poll `POST /trakt/auth/device/check` every `interval`s until `{ success: true }`.
4. Backend stores Trakt access + refresh tokens in `trakt_users` table.

Attempts to link the **same** Trakt ID to a different Miauflix user return **409 Conflict**.

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
app.get('/protected', ({ user }) => {
  return { message: `Hello ${user.email}!` };
});

// Admin-only route example
app.get('/admin', ({ user }) => {
  if (user.role !== UserRole.ADMIN) {
    throw new Error('Forbidden');
  }
  return { message: 'Admin access granted' };
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
