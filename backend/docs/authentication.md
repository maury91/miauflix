# Authentication System

### Overview

Miauflix uses a **secure, cookie-based authentication system** with rotating opaque refresh tokens and memory-stored JWT access tokens. This design provides maximum security by preventing client-side token theft and implementing efficient token rotation with race condition detection.

## Security Features

- **HttpOnly Cookie Refresh Tokens**: Refresh tokens stored in secure, HttpOnly cookies inaccessible to JavaScript
- **Memory-Only Access Tokens**: JWT access tokens stored in memory, never persisted client-side
- **Rotating Opaque Refresh Tokens**: Cryptographically secure tokens with atomic rotation and race condition detection
- **Atomic Token Updates**: Single token per user gets atomically updated on refresh
- **Chain Lifetime Limits**: Maximum refresh period prevents infinite token extension
- **User Session Management**: Configurable token limits per user (default: 5 concurrent sessions)
- **HS256 JWT Signatures**: HMAC-SHA256 with secret key for secure token signing
- **Origin/Referer Validation**: CSRF protection through header validation
- **Role-based Access Control**: Supports different user roles (USER, ADMIN)
- **Password Hashing**: Uses bcrypt for secure password storage
- **Comprehensive Audit Logging**: Security events and token operations logging
- **Admin-Only User Creation**: Only administrators can create new user accounts

## Authentication Flow

| Flow                        | Endpoint(s)                                                         | Notes                                                                  |
| --------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **E-mail + Password login** | `POST /api/auth/login`                                              | Returns access token + session + user info, sets session-scoped cookie |
| **Token refresh**           | `POST /api/auth/refresh/:session`                                   | No body required - uses session-scoped cookie                          |
| **Token validation**        | `POST /api/auth/refresh/:session?dry_run=true`                      | Validates token without rotation (for profile management)              |
| **Logout**                  | `POST /api/auth/logout/:session`                                    | Clears session-scoped cookie, deletes refresh token                    |
| **Trakt device-code link**  | `POST /api/trakt/auth/device` → `POST /api/trakt/auth/device/check` | Returns tokens + sets HttpOnly cookie                                  |

**Account creation** – only an **admin** may create users via `POST /auth/users`; self-registration is disabled.

#### Token Details

- **Access Token TTL**: 15 minutes (stored in memory only)
- **Refresh Token TTL**: 7 days (configurable via `REFRESH_TOKEN_EXPIRATION`), can be refreshed up to 30 days (configurable via `REFRESH_TOKEN_MAX_REFRESH_DAYS`)
- **Access Token Algorithm**: HS256 with HMAC-SHA256
- **Refresh Token**: Cryptographically secure random 256-bit tokens
- **Cookie Security**: HttpOnly, Secure, SameSite=Strict
- **Device Sessions**: Configurable limit per user (`MAX_DEVICE_SESSIONS_PER_USER`)

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

##### Usage Example

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

## API Endpoints

### Public Routes

#### `POST /api/auth/login` - Email/Password Login

- **Body**: `{ email: string, password: string }`
- **Returns**: `{ accessToken: string, session: string, user: { id: string, email: string, role: string } }`
- **Side Effects**:
  - Generates or reuses session for user/device combination
  - Sets session-scoped HttpOnly refresh token cookie with path restriction
- **Security**: Origin validation, rate limiting, device fingerprinting
- **Cookie**: Scoped to `/api/auth/` path (allows access from both refresh and logout endpoints)
- **Session Generation**:
  - Existing session: Reuses consistent session based on device fingerprint
  - New session: Generates new unique session identifier

#### `POST /api/auth/refresh/:session` - Refresh Access Token

- **Path Params**: `session` - Profile session identifier matching the login session
- **Query Params**: `dry_run=true` (optional) - Validates token without rotation
- **Body**: None (uses session-scoped HttpOnly cookie)
- **Returns**:
  - Normal mode: `{ accessToken: string, user: { id: string, email: string, role: string } }`
  - Dry-run mode: `{ valid: boolean }`
- **Side Effects**:
  - Normal mode: Atomically updates refresh token in same database row, updates device session
  - Dry-run mode: No side effects, only validation
- **Security**: Race condition detection via atomic UPDATE operations, chain lifetime validation
- **Use Case**: Dry-run mode used by client to validate stored profile sessions for profile selector

#### `POST /api/auth/logout/:session` - Logout

- **Path Params**: `session` - Profile session identifier matching the login/refresh session
- **Body**: None (uses session-scoped HttpOnly cookie)
- **Returns**: `{ message: string }`
- **Side Effects**: Clears session-scoped cookie, deletes refresh token from database

### Admin-Only Routes

#### `POST /api/auth/users` - Create User

- **Body**: `{ email: string, password: string, role: UserRole }`
- **Returns**: `{ id: string, email: string, role: UserRole }`
- **Security**: Admin role required, rate limiting

## Environment Variables

The authentication system uses the following environment variables:

```bash
# JWT Secret (auto-generated if not provided)
JWT_SECRET=auto-generated-hex-key

# Cookie Configuration
REFRESH_TOKEN_COOKIE_NAME=__miauflix_rt
COOKIE_DOMAIN=.yourdomain.com  # Optional - leave empty for same-origin
COOKIE_SECURE=false            # Default: false (allows HTTP for development)
                               # Set to true for production HTTPS environments

# Token Configuration
REFRESH_TOKEN_EXPIRATION=7d          # Amount of time before refresh tokens expire ( valid units are m | h | d )
REFRESH_TOKEN_MAX_REFRESH_DAYS=30    # Maximum days a refresh token can be refreshed
MAX_DEVICE_SESSIONS_PER_USER=5       # Maximum devices per user

# Streaming
STREAM_TOKEN_EXPIRATION=6h
STREAM_KEY_SALT=auto-generated
```

**Key Generation**: If JWT_SECRET is not provided, it is automatically generated on startup and should be saved to your `.env` file for consistency across restarts.

### Cookie Security Configuration

#### COOKIE_SECURE Environment Variable

The `COOKIE_SECURE` environment variable controls whether cookies are marked with the `Secure` attribute and affects security prefix usage:

**Development/Local (Default):**

```bash
COOKIE_SECURE=false  # Allows HTTP connections (localhost, development)
```

- Cookies work over HTTP and HTTPS
- No secure cookie prefix applied
- Suitable for local development and self-hosted environments without SSL

**Production (Recommended):**

```bash
COOKIE_SECURE=true   # Requires HTTPS connections
```

- Cookies only sent over HTTPS connections
- Automatically applies `__Secure-` prefix to cookie names
- Enhanced security for production environments
- **Required** for deployments with SSL certificates

#### Cookie Naming with Security Prefixes

When `COOKIE_SECURE=true`, the system automatically applies secure cookie prefixes per RFC 6265bis:

```javascript
// Development (COOKIE_SECURE=false):
Cookie: __miauflix_rt_session_abc123;

// Production (COOKIE_SECURE=true):
Cookie: __Secure - __miauflix_rt_session_abc123;
```

**Security Benefits of `__Secure-` Prefix:**

- **HTTP Downgrade Protection**: Browser enforces HTTPS-only transmission
- **Standards Compliance**: Follows RFC 6265bis security recommendations
- **Attack Prevention**: Prevents insecure sites from overwriting secure cookies

#### Deployment Scenarios

**Self-Hosted without SSL:**

```bash
COOKIE_SECURE=false
COOKIE_DOMAIN=          # Empty for same-origin only
```

**Self-Hosted with SSL:**

```bash
COOKIE_SECURE=true
COOKIE_DOMAIN=          # Empty for same-origin only
```

**Production with Custom Domain:**

```bash
COOKIE_SECURE=true
COOKIE_DOMAIN=.yourdomain.com
```

**Local Development:**

```bash
COOKIE_SECURE=false     # Allows http://localhost
COOKIE_DOMAIN=          # Empty for localhost
```

## Multi-Profile Session System

### Overview

The authentication system supports **multiple user profiles per browser** through a session-based cookie scoping mechanism. This allows users to maintain separate authenticated sessions for different profiles simultaneously.

### How Sessions Work

1. **Automatic Session Generation**: Login generates or reuses session identifiers based on user/device combinations
2. **Cookie Scoping**: Refresh tokens are stored in session-specific cookies with path restrictions
3. **URL-Based Routing**: Different sessions use different endpoint paths for automatic cookie selection
4. **Profile Management**: Client can validate all stored sessions to show available profiles
5. **Session Reuse**: Same user on same device gets consistent session for existing sessions

### Session-Based Cookie System

```javascript
// Each session gets its own cookie name, all cookies accessible to auth endpoints
Cookie: __miauflix_rt_session_abc123  →  Available to /api/auth/* endpoints
Cookie: __miauflix_rt_session_def456  →  Available to /api/auth/* endpoints
Cookie: __miauflix_rt_session_ghi789  →  Available to /api/auth/* endpoints

// Session isolation through cookie names, not path restrictions
/api/auth/refresh/session_abc123   →  Uses __miauflix_rt_session_abc123
/api/auth/logout/session_abc123    →  Uses __miauflix_rt_session_abc123
/api/auth/refresh/session_def456   →  Uses __miauflix_rt_session_def456
/api/auth/logout/session_def456    →  Uses __miauflix_rt_session_def456
```

**Cookie Properties:**

- **Name**: `{REFRESH_TOKEN_COOKIE_NAME}_{session}` (e.g., `__miauflix_rt_session_abc123`)
- **Path**: `/api/auth/` (restricts cookie to all auth endpoints, enables logout functionality)
- **Session Isolation**: Through unique cookie names, not path restrictions
- **HttpOnly**: True (prevents JavaScript access)
- **Secure**: True (HTTPS only)
- **SameSite**: Strict (CSRF protection)

### Client Profile Management

```javascript
// Login and get session
const loginResponse = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({ email, password }),
});

const { accessToken, session, user } = await loginResponse.json();

// Store session for this profile
const profiles = JSON.parse(localStorage.getItem('profiles') || '{}');
profiles[user.email] = { session, user };
localStorage.setItem('profiles', JSON.stringify(profiles));

// On app startup, validate all stored profile sessions
const storedProfiles = JSON.parse(localStorage.getItem('profiles') || '{}');
const validProfiles = {};

for (const [email, profile] of Object.entries(storedProfiles)) {
  try {
    // Dry-run validation - no token rotation
    const response = await fetch(`/api/auth/refresh/${profile.session}?dry_run=true`, {
      method: 'POST',
      credentials: 'include', // Include session-scoped cookies
    });

    if (response.ok) {
      const { valid } = await response.json();
      if (valid) {
        validProfiles[email] = profile;
      }
    }
  } catch (error) {
    // Profile is invalid, remove from storage
    console.log(`Profile ${email} is no longer valid`);
  }
}

// Update storage and show profile selector
localStorage.setItem('profiles', JSON.stringify(validProfiles));
showProfileSelector(validProfiles);
```

### Authentication Flow with Sessions

1. **Login**: `POST /api/auth/login` → Returns `{ session: "session_abc123", ... }` and sets `__miauflix_rt_session_abc123` cookie
2. **Client Storage**: Client stores session identifier in localStorage for profile management
3. **Token Use**: Client stores access token in memory/sessionStorage for API calls
4. **Profile Switch**: Client can switch between profiles without re-authentication
5. **Token Refresh**: `POST /api/auth/refresh/session_abc123` → Browser automatically sends correct cookie
6. **Logout**: `POST /api/auth/logout/session_abc123` → Clears specific profile's cookie

### Benefits

- **Multiple Profiles**: Users can stay logged into multiple accounts simultaneously
- **Automatic Cookie Selection**: Browser handles cookie routing based on URL paths
- **Profile Persistence**: Profiles remain authenticated across browser sessions
- **Easy Validation**: Dry-run mode allows efficient profile state checking
- **Clean Logout**: Each profile can be logged out independently

## Frontend Session Management

### Security Models

The frontend can choose between two session management approaches based on security requirements:

#### Option 1: Memory-Only Storage (Maximum Security)

```javascript
class MemorySessionStore {
  private sessions = new Map();

  storeSession(email, sessionId) {
    this.sessions.set(email, {
      session: sessionId,
      timestamp: Date.now()
    });
  }

  getSession(email) {
    return this.sessions.get(email)?.session || null;
  }

  clearExpiredSessions() {
    const now = Date.now();
    const TIMEOUT = 15 * 60 * 1000; // 15 minutes

    for (const [email, data] of this.sessions) {
      if (now - data.timestamp > TIMEOUT) {
        this.sessions.delete(email);
      }
    }
  }
}
```

**Security Properties:**

- ✅ Maximum security - no JavaScript access from malicious scripts
- ✅ Memory cleared on tab close/refresh
- ✅ No persistent storage exposure
- ❌ Requires re-login for each tab/session

#### Option 2: SessionStorage (Balanced Security)

```javascript
class SessionStorageStore {
  private readonly STORAGE_KEY = 'miauflix_sessions';

  storeSession(email, sessionId) {
    try {
      const sessions = this.getAllSessions();
      sessions[email] = {
        session: sessionId,
        timestamp: Date.now()
      };
      sessionStorage.setItem(this.STORAGE_KEY, JSON.stringify(sessions));
    } catch (error) {
      console.error('Failed to store session:', error);
      // Fallback to memory storage
    }
  }

  getSession(email) {
    try {
      const sessions = this.getAllSessions();
      return sessions[email]?.session || null;
    } catch (error) {
      console.error('Failed to retrieve session:', error);
      return null;
    }
  }

  getAllSessions() {
    try {
      const data = sessionStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : {};
    } catch (error) {
      console.error('Failed to parse sessions:', error);
      return {};
    }
  }

  async validateStoredSessions() {
    const sessions = this.getAllSessions();
    const validSessions = {};

    for (const [email, data] of Object.entries(sessions)) {
      try {
        // Dry-run validation
        const response = await fetch(`/api/auth/refresh/${data.session}?dry_run=true`, {
          method: 'POST',
          credentials: 'include'
        });

        if (response.ok) {
          const { valid } = await response.json();
          if (valid) {
            validSessions[email] = data;
          }
        }
      } catch (error) {
        console.log(`Session validation failed for ${email}:`, error);
      }
    }

    // Update storage with only valid sessions
    sessionStorage.setItem(this.STORAGE_KEY, JSON.stringify(validSessions));
    return validSessions;
  }

  clearInvalidSessions() {
    // Clear all sessions on security errors
    sessionStorage.removeItem(this.STORAGE_KEY);
  }
}
```

**Security Properties:**

- ✅ Survives tab refresh and new tabs
- ✅ Better UX for multi-tab usage
- ✅ Automatically cleared when browser closes
- ❌ Accessible to malicious JavaScript (XSS risk)
- ❌ Requires additional security hardening

### SessionStorage Security Hardening Requirements

When using sessionStorage for session management, the following security measures are **mandatory**:

#### 1. Content Security Policy (CSP)

**Minimum Required CSP:**

```http
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'nonce-{random}';
  object-src 'none';
  base-uri 'self';
  frame-ancestors 'none';
  form-action 'self';
  upgrade-insecure-requests;
```

**Strict Production CSP (Recommended):**

```http
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'nonce-{random}';
  style-src 'self' 'nonce-{random}';
  img-src 'self' data: https:;
  connect-src 'self';
  font-src 'self';
  object-src 'none';
  media-src 'self';
  child-src 'none';
  frame-src 'none';
  worker-src 'self';
  frame-ancestors 'none';
  form-action 'self';
  base-uri 'self';
  manifest-src 'self';
  upgrade-insecure-requests;
  require-trusted-types-for 'script';
```

**Why CSP is Critical:**

- Prevents XSS attacks that could read sessionStorage
- Blocks malicious script injection from CDNs
- Restricts inline JavaScript execution
- Prevents clickjacking attacks

#### 2. Additional Security Headers

```http
# Prevent MIME type sniffing attacks
X-Content-Type-Options: nosniff

# Enable XSS filtering in browsers
X-XSS-Protection: 1; mode=block

# Prevent iframe embedding (clickjacking)
X-Frame-Options: DENY

# Force HTTPS connections
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload

# Control referrer information
Referrer-Policy: strict-origin-when-cross-origin

# Disable DNS prefetching
X-DNS-Prefetch-Control: off

# Disable feature policy
Permissions-Policy: geolocation=(), microphone=(), camera=()
```

#### 3. XSS Prevention Strategies

**Input Sanitization:**

```javascript
// ✅ ALWAYS use established, well-tested libraries for sanitization
import DOMPurify from 'dompurify';

// For HTML content sanitization
const cleanHTML = DOMPurify.sanitize(userInput);

// For HTML entity encoding in frameworks
import { escape } from 'lodash';
const safeText = escape(userInput);

// ❌ NEVER implement your own sanitization functions
// Custom sanitization is prone to bypass vulnerabilities and security flaws
```

**Security Principle: Never Roll Your Own Sanitization**

- Custom sanitization functions are extremely vulnerable to bypass attacks
- Use battle-tested libraries like DOMPurify, OWASP Java HTML Sanitizer, or framework-built-in escaping
- Sanitization libraries are maintained by security experts and regularly updated against new attack vectors

**Safe DOM Manipulation:**

```javascript
// ✅ Safe - Use textContent for user data
element.textContent = userInput;

// ✅ Safe - Use framework templates
<div>{sanitizedInput}</div>;

// ❌ Dangerous - Never use innerHTML with user data
element.innerHTML = userInput; // XSS VULNERABILITY
```

**Template Security:**

```javascript
// ✅ Use framework-provided escaping
const SafeComponent = ({ userInput }) => (
  <div>{userInput}</div> // React automatically escapes
);

// ❌ Avoid dangerouslySetInnerHTML
const UnsafeComponent = ({ userInput }) => (
  <div dangerouslySetInnerHTML={{ __html: userInput }} /> // XSS RISK
);
```

#### 4. Session Storage Implementation

```javascript
// Production-ready session storage with security
class SecureSessionStorage {
  private readonly STORAGE_KEY = 'miauflix_auth_sessions';
  private readonly MAX_SESSIONS = 5;
  private readonly SESSION_TIMEOUT = 15 * 60 * 1000; // 15 minutes

  constructor() {
    this.setupSecurityMonitoring();
  }

  storeSession(email, sessionId) {
    try {
      // Validate inputs
      if (!this.isValidEmail(email) || !this.isValidSessionId(sessionId)) {
        throw new Error('Invalid session data');
      }

      const sessions = this.getAllSessions();

      // Enforce session limits
      if (Object.keys(sessions).length >= this.MAX_SESSIONS) {
        this.removeOldestSession(sessions);
      }

      sessions[email] = {
        session: sessionId,
        timestamp: Date.now(),
        userAgent: navigator.userAgent.slice(0, 100), // Limited for security
      };

      this.saveToStorage(sessions);
      this.logSecurityEvent('session_stored', email);
    } catch (error) {
      this.handleSecurityError('store_session_failed', error);
    }
  }

  private isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return typeof email === 'string' &&
           email.length <= 254 &&
           emailRegex.test(email);
  }

  private isValidSessionId(sessionId) {
    // Session IDs should match our backend format
    const sessionRegex = /^session_[A-Za-z0-9_-]{21,22}$/;
    return typeof sessionId === 'string' && sessionRegex.test(sessionId);
  }

  private saveToStorage(sessions) {
    const data = JSON.stringify(sessions);
    if (data.length > 10000) { // Prevent storage bloat
      throw new Error('Session data too large');
    }
    sessionStorage.setItem(this.STORAGE_KEY, data);
  }

  private setupSecurityMonitoring() {
    // Monitor for suspicious activity
    window.addEventListener('storage', (event) => {
      if (event.key === this.STORAGE_KEY) {
        this.logSecurityEvent('external_session_modification', null);
        this.clearInvalidSessions(); // Clear on tampering
      }
    });

    // Periodic cleanup
    setInterval(() => this.cleanupExpiredSessions(), 60000); // Every minute
  }

  private logSecurityEvent(event, email) {
    console.log(`Security Event: ${event}`, {
      timestamp: new Date().toISOString(),
      email,
      userAgent: navigator.userAgent,
    });
  }

  private handleSecurityError(event, error) {
    this.logSecurityEvent(event, null);
    console.error('Session security error:', error);

    // On security errors, clear all sessions
    this.clearInvalidSessions();
  }
}
```

#### 5. Build Configuration

```javascript
// webpack.config.js or vite.config.js
const config = {
  define: {
    // Configure session storage mode at build time
    __SESSION_STORAGE_MODE__: JSON.stringify(
      process.env.NODE_ENV === 'production'
        ? process.env.SESSION_STORAGE_MODE || 'sessionStorage'
        : 'memory'
    ),
    __MAX_SESSIONS__: JSON.stringify(parseInt(process.env.MAX_SESSIONS) || 5),
  },
};

// Usage in application
const sessionStore = new SessionManager({
  mode: __SESSION_STORAGE_MODE__,
  maxSessions: __MAX_SESSIONS__,
});
```

#### 6. Monitoring and Alerting

```javascript
// Security event monitoring
class SecurityMonitor {
  static reportViolation(violation) {
    // Report CSP violations
    fetch('/api/security/csp-violation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        violation,
        timestamp: Date.now(),
        userAgent: navigator.userAgent,
        url: window.location.href,
      }),
    });
  }

  static reportSessionAnomaly(anomaly) {
    console.warn('Session anomaly detected:', anomaly);
    // Consider clearing sessions on suspicious activity
  }
}

// CSP violation reporting
document.addEventListener('securitypolicyviolation', event => {
  SecurityMonitor.reportViolation({
    blockedURI: event.blockedURI,
    violatedDirective: event.violatedDirective,
    originalPolicy: event.originalPolicy,
  });
});
```

### Deployment Security Checklist

**Before enabling sessionStorage mode:**

- [ ] CSP headers properly configured and tested
- [ ] All security headers implemented
- [ ] Input sanitization implemented throughout application
- [ ] XSS testing completed with automated tools
- [ ] Session storage implementation reviewed for security
- [ ] Error handling prevents information disclosure
- [ ] Monitoring and alerting configured
- [ ] Security incident response plan established
- [ ] `COOKIE_SECURE=true` configured for HTTPS environments
- [ ] SSL/TLS certificates properly installed and configured

**Ongoing Security Requirements:**

- [ ] Regular security audits and penetration testing
- [ ] Dependency updates and vulnerability scanning
- [ ] CSP policy updates as application evolves
- [ ] Session storage anomaly monitoring
- [ ] User education about security best practices

## Token Rotation System

### Session-Based Token Updates

The refresh token system uses a **single database row per user session** that gets atomically updated on each refresh:

```sql
-- Login: Creates initial token with session identifier
INSERT INTO refresh_tokens (token, userId, session, expiresAt, createdAt, ...)

-- Refresh: Atomic update with race condition detection
UPDATE refresh_tokens
SET token = 'new_token', expiresAt = 'new_expiry', updatedAt = NOW()
WHERE token = 'old_token' AND userId = 'user_id' AND session = 'session_id'
-- Returns affected_rows: 1 = success, 0 = race condition/token reuse
```

### Key Benefits

- **Database Efficiency**: One row per session instead of unlimited growth
- **Session Isolation**: Each user session has its own token that can't interfere with others
- **Automatic Revocation**: Old token disappears when new one is created
- **Race Condition Detection**: Concurrent refresh attempts are detected via UPDATE affected rows
- **Chain Lifetime**: Uses `createdAt` + `REFRESH_TOKEN_MAX_REFRESH_DAYS` to prevent infinite refresh
- **Proper Token Identification**: Session ID ensures the correct token is updated/deleted

### Security Flow

1. **Token Refresh Request**: Client sends old token in HttpOnly cookie
2. **Validation**: Verify token exists and chain hasn't exceeded lifetime
3. **Atomic Update**: Generate new token and UPDATE WHERE old_token matches
4. **Race Detection**: If affected_rows = 0, token was already used (security event)
5. **Success**: Return new access token, client gets new refresh token cookie

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
