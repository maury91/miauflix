# Security System

The backend implements a comprehensive security system with multiple layers of protection:

## Security Features

### Authentication & Authorization

- **Whitelist Approach**: All routes are protected by default unless explicitly whitelisted
- **JWT-based Authentication**: Secure token-based authentication using industry-standard implementation
- **Refresh Token Rotation**: Implements secure token refresh mechanism
- **Role-based Access Control**: Supports different user roles (USER, ADMIN)
- **Password Hashing**: Uses bcrypt for secure password storage
- **Token Expiration**: Access tokens expire after 15 minutes, refresh tokens after 7 days
- **Admin-Only User Creation**: Only administrators can create new user accounts

### Security Monitoring & Detection

- **VPN Detection**: Integrated NordVPN detection service for user monitoring
- **Audit Logging**: Comprehensive audit trail system tracking all security events
- **Rate Limiting**: Protection against brute force and DoS attacks
- **Security Event Logging**: Detailed logging of authentication attempts, authorization failures, and suspicious activities

### Data Encryption

- **Database Field Encryption**: All sensitive torrent data is encrypted at rest using AES-256-GCM
- **Torrent Identifier Protection**: Hash values, magnet links, and torrent files are automatically encrypted
- **Deterministic Encryption**: Searchable fields use deterministic encryption for uniqueness constraints
- **Key Management**: Secure encryption key handling via environment variables
- **Migration Support**: Automated scripts to encrypt existing data during upgrades

### Infrastructure Security

- **Input Sanitization**: Comprehensive input validation and sanitization
- **CORS Configuration**: Properly configured Cross-Origin Resource Sharing
- **Error Handling**: Secure error handling that doesn't leak sensitive information
- **Session Management**: Secure token-based session management

## Authentication Flow

1. **User Creation**: Only administrators can create new user accounts
2. **Login**: Users receive access and refresh tokens upon successful login
3. **Token Refresh**: Users can refresh their access token using their refresh token
4. **Logout**: Users can invalidate their refresh token to log out

## Environment Variables

The following environment variables are required:

```env
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
4. Regularly rotate JWT secrets and encryption keys
5. Monitor for suspicious activity
6. Implement proper error handling
7. Use secure password policies
8. Verify database encryption is working (only ciphertext should be visible in raw DB)

## JWT Implementation

The authentication system uses industry-standard JWT handling, which provides:

- **Standards Compliance**: Full implementation of JWT standards
- **Advanced Security**: Support for multiple algorithms and key types
- **Fine-grained Control**: Detailed control over token claims and headers
- **Type Safety**: Excellent TypeScript support
- **Performance**: Optimized for performance with minimal dependencies

## VPN Detection

The system includes VPN detection capabilities:

- **NordVPN Detection**: Monitors user connections for NordVPN usage
- **IP Geolocation**: Uses IP geolocation services to detect VPN usage
- **Automated Monitoring**: Continuous monitoring of user connections
- **Security Logging**: All VPN detection events are logged for security analysis

## Audit Logging

Comprehensive audit logging system tracks:

- **Authentication Events**: Login attempts, token refresh, logout events
- **Authorization Failures**: Failed access attempts to protected resources
- **User Management**: User creation, role changes, account modifications
- **Security Events**: VPN detection, suspicious activity, rate limit violations
- **System Events**: Configuration changes, service starts/stops
- **API Access**: All API endpoint access with user context

### Audit Log Structure

Each audit log entry includes:

- Timestamp
- User ID (if authenticated)
- Event type
- Event details
- IP address
- User agent
- Request metadata

## Rate Limiting

Protection against abuse:

- **Authentication Endpoints**: Special rate limiting for login/register endpoints
- **API Endpoints**: General rate limiting for all API access
- **User-specific Limits**: Different limits based on user roles
- **IP-based Limits**: Protection against distributed attacks
