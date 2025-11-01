# Authentication User Flows

## Overview

Miauflix implements a sophisticated multi-profile authentication system with session-based security using HttpOnly cookies. The authentication flow supports both traditional email/password login and modern QR code authentication for seamless device pairing.

## 1. App Initialization Flow

The application startup sequence determines user navigation based on stored authentication profiles.

```mermaid
graph TD
    A[App Starts] --> B[Health Check Backend]
    B --> C{Backend Available?}
    C -->|No| D[Show Connection Error]
    C -->|Yes| E[Check Stored Profiles]
    E --> F{How Many Profiles?}
    F -->|0 Profiles| G[Navigate to Login]
    F -->|1 Profile| H[Auto-validate Token]
    F -->|Multiple Profiles| I[Navigate to Profile Selection]
    H --> J{Token Valid?}
    J -->|Yes| K[Navigate to Home]
    J -->|No| L[Navigate to Login]
    D --> M[Retry Connection]
    M --> B
```

**Key Components:**
- **Health Check**: `frontend/src/hooks/useAppInitialization.ts`
- **Profile Detection**: Stored in local storage with encryption
- **Token Validation**: Automatic refresh token mechanism

## 2. Email/Password Authentication Flow

Traditional email and password login with secure session establishment.

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant B as Backend
    participant DB as Database

    U->>F: Enter email/password
    F->>F: Validate input format
    F->>B: POST /api/auth/login
    B->>DB: Verify credentials
    DB-->>B: User data
    B->>B: Generate JWT + Refresh Token
    B->>F: Set HttpOnly cookie + JWT
    F->>F: Store JWT locally
    F->>F: Create user profile
    F->>F: Navigate to home
    
    Note over F,B: Session established with HttpOnly cookies
```

**Implementation Details:**
- **Component**: `frontend/src/app/pages/login/components/LoginWithEmail.tsx`
- **API**: `frontend/src/store/api/auth.ts`
- **Security**: HttpOnly cookies for refresh tokens, JWT for API access
- **Error Handling**: Input validation, network errors, invalid credentials

## 3. QR Code Authentication Flow

Modern device-to-device authentication using QR codes for seamless login experience.

```mermaid
sequenceDiagram
    participant U1 as User (Device 1)
    participant F1 as Frontend (Device 1)
    participant U2 as User (Device 2)
    participant F2 as Frontend (Device 2)
    participant B as Backend

    U1->>F1: Select QR Code Login
    F1->>B: Request authentication session
    B-->>F1: Session ID + QR data
    F1->>F1: Generate QR Code
    F1->>F1: Start polling for auth status
    
    U2->>F2: Scan QR Code
    F2->>B: Confirm authentication (Session ID)
    B->>B: Link devices
    B-->>F2: Confirmation
    
    F1->>B: Poll authentication status
    B-->>F1: Authentication successful + tokens
    F1->>F1: Store JWT + create profile
    F1->>F1: Navigate to home
```

**Implementation Details:**
- **QR Component**: `frontend/src/app/pages/login/components/QRDisplay.tsx`
- **QR Login**: `frontend/src/app/pages/login/components/LoginWithQR.tsx`
- **Polling**: Continuous status checking until authentication complete
- **Cross-Device**: Secure session linking between devices

## 4. Profile Management Flow

Multi-user support with secure profile storage and switching capabilities.

```mermaid
graph TD
    A[Multiple Profiles Detected] --> B[Show Profile Selection]
    B --> C[User Selects Profile]
    C --> D{Profile Token Valid?}
    D -->|Yes| E[Navigate to Home]
    D -->|No| F[Token Refresh Attempt]
    F --> G{Refresh Successful?}
    G -->|Yes| E
    G -->|No| H[Remove Invalid Profile]
    H --> I[Navigate to Login]
    
    B --> J[Add New Profile]
    J --> K[Navigate to Login]
    K --> L[Complete Authentication]
    L --> M[Store New Profile]
    M --> E
```

**Key Features:**
- **Component**: `frontend/src/app/pages/welcome/`
- **Storage**: Encrypted profile data in local storage
- **Security**: Individual JWT tokens per profile
- **Management**: Add/remove profiles, automatic cleanup of expired profiles

## 5. Session Management & Token Refresh

Automatic token management ensuring continuous authenticated sessions.

```mermaid
sequenceDiagram
    participant F as Frontend
    participant B as Backend
    participant C as HttpOnly Cookie

    F->>B: API Request with JWT
    B-->>F: 401 Unauthorized (token expired)
    F->>F: Detect token expiry
    F->>B: POST /api/auth/refresh (HttpOnly cookie)
    B->>C: Validate refresh token
    C-->>B: Valid refresh token
    B-->>F: New JWT token
    F->>F: Update stored JWT
    F->>B: Retry original request
    B-->>F: Success with data
    
    Note over F,B: Seamless token refresh without user intervention
```

**Implementation Details:**
- **Automatic Refresh**: Triggered on 401 responses
- **Security**: Refresh tokens stored as HttpOnly cookies
- **Fallback**: Redirect to login if refresh fails
- **State Management**: Redux store maintains authentication state

## 6. Logout Flow

Secure session termination with complete cleanup.

```mermaid
graph TD
    A[User Initiates Logout] --> B[Call Logout API]
    B --> C[Backend Invalidates Tokens]
    C --> D[Clear HttpOnly Cookies]
    D --> E[Frontend Clears JWT]
    E --> F[Clear Profile Data]
    F --> G[Reset Application State]
    G --> H[Navigate to Login]
```

**Security Measures:**
- **Server-side**: Token invalidation and session cleanup
- **Client-side**: Complete local storage cleanup
- **State Reset**: Redux store reset to initial state
- **Cookie Cleanup**: HttpOnly refresh tokens removed

## 7. Error Handling & Recovery

Comprehensive error handling for various authentication scenarios.

```mermaid
graph TD
    A[Authentication Error] --> B{Error Type?}
    B -->|Network Error| C[Retry with Exponential Backoff]
    B -->|Invalid Credentials| D[Show Error Message]
    B -->|Token Expired| E[Attempt Token Refresh]
    B -->|Server Error| F[Show Server Error]
    
    C --> G{Retry Successful?}
    G -->|Yes| H[Continue Flow]
    G -->|No| I[Show Connection Error]
    
    E --> J{Refresh Successful?}
    J -->|Yes| H
    J -->|No| K[Navigate to Login]
    
    D --> L[Allow Retry]
    F --> L
    I --> L
    L --> A
```

## Technical Implementation

### State Management
- **Redux Store**: `frontend/src/store/slices/app.ts`
- **Authentication State**: User data, JWT tokens, profile management
- **UI State**: Loading states, error messages, navigation state

### API Integration
- **Auth API**: `frontend/src/store/api/auth.ts`
- **RTK Query**: Centralized API state management
- **Error Handling**: Automatic retry logic and error boundaries

### Security Features
- **Session-based**: HttpOnly cookies for refresh tokens
- **JWT Access Tokens**: Short-lived tokens for API access
- **Profile Encryption**: Local profile data encryption
- **CSRF Protection**: Built into session cookie implementation

## User Experience Considerations

### Performance
- **Fast Profile Detection**: Immediate routing based on stored profiles
- **Background Refresh**: Token renewal without user interruption
- **Optimistic Updates**: UI updates before server confirmation

### Accessibility
- **Keyboard Navigation**: Full keyboard support for login forms
- **Screen Readers**: Proper ARIA labels and announcements
- **Error Messages**: Clear, actionable error descriptions

### Multi-Platform Support
- **Responsive Design**: Works across desktop, mobile, and TV platforms
- **TV Navigation**: Remote control support for TV interfaces
- **Cross-Device**: QR code authentication for device pairing