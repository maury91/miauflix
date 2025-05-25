# Trakt Integration

This implementation provides Trakt.tv integration for user authentication and tracking. Users can link their Trakt accounts to sync their watching progress and access personalized recommendations.

## Features

- **Device Authentication**: Users can link their Trakt accounts using the OAuth device flow
- **User Association**: Admin users can associate Trakt accounts with system users
- **Token Management**: Automatic token refresh for maintaining authentication
- **Single User Constraint**: Only one system user can be associated with each Trakt account

## API Endpoints

### User Endpoints

#### `POST /trakt/auth/device`

Initiates the Trakt device authentication flow.

**Authentication**: Required (any authenticated user)
**Rate Limit**: 2 requests per second

**Response**:

```json
{
  "success": true,
  "codeUrl": "https://trakt.tv/activate/ABC123",
  "userCode": "ABC123",
  "deviceCode": "device_code_here",
  "expiresIn": 600,
  "interval": 5
}
```

#### `POST /trakt/auth/device/check`

Checks the status of device authentication and completes the linking process.

**Authentication**: Required (any authenticated user)
**Rate Limit**: 1 request per second

**Request Body**:

```json
{
  "deviceCode": "device_code_here"
}
```

**Response** (Success):

```json
{
  "success": true,
  "traktUsername": "username",
  "traktSlug": "user-slug"
}
```

**Response** (Pending):

```json
{
  "success": false,
  "pending": true
}
```

#### `GET /trakt/association`

Gets the current user's Trakt association status.

**Authentication**: Required (any authenticated user)
**Rate Limit**: 5 requests per second

**Response**:

```json
{
  "associated": true,
  "traktUsername": "username",
  "traktSlug": "user-slug"
}
```

### Admin Endpoints

#### `POST /trakt/admin/associate`

Associates a Trakt account with a system user (admin only).

**Authentication**: Required (admin role)
**Rate Limit**: 1 request per second

**Request Body**:

```json
{
  "traktSlug": "user-slug",
  "userEmail": "user@example.com"
}
```

**Response**:

```json
{
  "success": true,
  "association": {
    "id": "uuid",
    "traktSlug": "user-slug",
    "userEmail": "user@example.com"
  }
}
```

## Configuration

Add the following environment variables:

```env
TRAKT_CLIENT_ID=your_client_id
TRAKT_CLIENT_SECRET=your_client_secret
TRAKT_API_URL=https://api.trakt.tv
```

To obtain Trakt API credentials:

1. Visit https://trakt.tv/oauth/applications
2. Create a new application
3. Copy the Client ID and Client Secret

## Database Schema

The integration adds a `trakt_users` table with the following structure:

- `id` (UUID) - Primary key
- `userId` (UUID) - Foreign key to users table (nullable)
- `traktSlug` (string) - Unique Trakt user identifier
- `traktUsername` (string) - Trakt username (nullable)
- `accessToken` (string) - OAuth access token (nullable)
- `refreshToken` (string) - OAuth refresh token (nullable)
- `tokenExpiresAt` (datetime) - Token expiration time (nullable)
- `createdAt` (datetime) - Record creation time
- `updatedAt` (datetime) - Record update time

## Usage Flow

1. **User Authentication**:

   - User calls `/trakt/auth/device` to get a device code
   - User visits the provided URL and enters the user code on Trakt
   - User polls `/trakt/auth/device/check` until authentication completes

2. **Admin Management**:

   - Admins can use `/trakt/admin/associate` to manually associate Trakt accounts
   - This is useful for pre-existing Trakt accounts or troubleshooting

3. **Token Management**:
   - Tokens are automatically refreshed when needed
   - The system ensures only one user per Trakt account constraint

## Security Features

- Rate limiting on all endpoints
- Audit logging for all authentication events
- Secure token storage and automatic refresh
- Admin-only association management
- User isolation (users can only see their own associations)

## Error Handling

- Graceful handling of expired/invalid tokens
- Automatic token refresh before expiration
- Clear error messages for authentication failures
- Proper HTTP status codes for different scenarios
