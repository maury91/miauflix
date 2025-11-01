# User Management & Settings User Flows

## Overview

Miauflix implements comprehensive user management with multi-profile support, personalized settings, watch progress tracking, and administrative controls. The system supports individual user preferences while maintaining secure session management.

## 1. Multi-Profile Management Flow

Support for multiple user profiles on a single device with secure profile switching.

```mermaid
graph TD
    A[App Launch] --> B{Existing Profiles?}
    B -->|None| C[Navigate to Login]
    B -->|Single Profile| D[Auto-login with Token Validation]
    B -->|Multiple Profiles| E[Show Profile Selection Screen]
    
    E --> F[Display Profile Cards]
    F --> G[User Selects Profile]
    G --> H{Profile Token Valid?}
    H -->|Yes| I[Navigate to Home]
    H -->|No| J[Attempt Token Refresh]
    J --> K{Refresh Success?}
    K -->|Yes| I
    K -->|No| L[Remove Invalid Profile]
    L --> M{Other Profiles Available?}
    M -->|Yes| E
    M -->|No| C
    
    F --> N[Add New Profile Button]
    N --> O[Navigate to Login]
    O --> P[Complete Authentication]
    P --> Q[Create New Profile Entry]
    Q --> R[Store Profile Data]
    R --> I
```

**Key Components:**
- **Profile Selection**: `frontend/src/app/pages/welcome/`
- **Profile Storage**: Encrypted local storage with individual JWT tokens
- **Profile Management**: Add/remove profiles with secure cleanup

## 2. User Profile Creation & Management

Individual profile setup with personalized preferences.

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant API as Backend API
    participant DB as Database
    participant Storage as Local Storage

    U->>F: Complete login process
    F->>API: Authenticate user
    API->>DB: Validate credentials
    DB-->>API: User data + preferences
    API-->>F: JWT tokens + user info
    
    F->>F: Create profile object
    F->>Storage: Store encrypted profile
    F->>F: Set active profile
    F->>F: Initialize user preferences
    F->>F: Load personalized content
    
    Note over F,Storage: Profile includes: tokens, preferences, watch history
```

**Profile Data Structure:**
- **Authentication**: JWT access token, refresh token metadata
- **User Info**: Username, email, profile picture, preferences
- **Viewing History**: Watch progress, favorites, watchlists
- **Settings**: Language, quality preferences, subtitle settings

## 3. Watch Progress & History Management

Comprehensive tracking of user viewing activity across devices.

```mermaid
graph TD
    A[Video Playback] --> B[Initialize Progress Tracking]
    B --> C[Monitor Playback Position]
    C --> D[Update Progress Every 10s]
    D --> E[Send to Backend API]
    E --> F[Store in User Database]
    
    G[User Accesses Content] --> H[Check Existing Progress]
    H --> I{Progress Found?}
    I -->|Yes| J[Display Resume Option]
    I -->|No| K[Show Fresh Start]
    
    J --> L[Resume from Last Position]
    L --> M[Continue Progress Tracking]
    M --> C
    
    K --> N[Start from Beginning]
    N --> B
    
    O[Video Completion] --> P[Mark as Watched]
    P --> Q[Update Watch Status]
    Q --> R[Add to Watch History]
    R --> S[Update Statistics]
```

**Progress Features:**
- **Cross-Device Sync**: Progress available on all user devices
- **Resume Watching**: Automatic resume from last viewed position
- **Watch Statistics**: Total watch time, completion rates
- **History Management**: View and manage watch history

## 4. Watchlist & Favorites Management

Personal content curation with list management capabilities.

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant API as Lists API
    participant Trakt as Trakt.tv Service
    participant DB as Database

    U->>F: Add to Watchlist
    F->>API: POST /api/lists/watchlist
    API->>DB: Add to user's watchlist
    API->>Trakt: Sync to Trakt.tv (if configured)
    Trakt-->>API: Confirmation
    API-->>F: Success response
    F->>F: Update UI state
    
    U->>F: View Watchlists
    F->>API: GET /api/lists/user
    API->>DB: Fetch user lists
    API->>Trakt: Sync from Trakt.tv
    Trakt-->>API: Latest list data
    API-->>F: Combined list data
    F->>F: Display personal lists
```

**List Management Features:**
- **Personal Watchlists**: Custom content lists
- **Favorites**: Quick access to preferred content
- **Trakt.tv Integration**: Sync with external service
- **List Sharing**: Share lists with other users (if implemented)

## 5. User Preferences & Settings

Comprehensive settings management for personalized experience.

```mermaid
graph TD
    A[User Accesses Settings] --> B[Load Current Preferences]
    B --> C[Display Settings Categories]
    C --> D[Playback Settings]
    C --> E[Display Settings]
    C --> F[Language Settings]
    C --> G[Privacy Settings]
    
    D --> H[Quality Preferences]
    D --> I[Autoplay Settings]
    D --> J[Subtitle Preferences]
    
    E --> K[Theme Selection]
    E --> L[Interface Options]
    
    F --> M[Audio Language]
    F --> N[Subtitle Language]
    F --> O[Interface Language]
    
    G --> P[Watch History Privacy]
    G --> Q[Data Sharing Options]
    
    H --> R[Save to Backend]
    I --> R
    J --> R
    K --> S[Save to Local Storage]
    L --> S
    M --> R
    N --> R
    O --> T[Update Interface]
    P --> R
    Q --> R
    
    R --> U[Update Database]
    S --> V[Apply UI Changes]
    T --> V
```

**Settings Categories:**

### Playback Preferences
- **Default Quality**: Auto, 720p, 1080p, 4K preferences
- **Codec Preference**: H.264 vs HEVC (x265) selection
- **Autoplay**: Next episode, continuous playback
- **Skip Intros**: Automatic intro skipping

### Display & Interface
- **Theme**: Light, dark, system preference
- **Language**: Interface language selection
- **Navigation**: Spatial navigation sensitivity for TV
- **Accessibility**: High contrast, font size options

### Audio & Subtitles
- **Default Audio Language**: Preferred audio track language
- **Default Subtitle Language**: Preferred subtitle language
- **Subtitle Settings**: Font size, color, background
- **Audio Settings**: Volume normalization, surround sound

## 6. Account Security & Session Management

Security controls and session management for user accounts.

```mermaid
graph TD
    A[Security Settings] --> B[Active Sessions]
    A --> C[Password Management]
    A --> D[Two-Factor Authentication]
    A --> E[Login History]
    
    B --> F[List All Sessions]
    F --> G[Session Details]
    G --> H[Device, Location, Time]
    G --> I[Revoke Session Option]
    I --> J[Invalidate Remote Session]
    
    C --> K[Change Password]
    K --> L[Validate Current Password]
    L --> M[Set New Password]
    M --> N[Invalidate All Other Sessions]
    
    D --> O[Setup 2FA]
    O --> P[QR Code Generation]
    P --> Q[Verify Setup]
    Q --> R[Enable 2FA]
    
    E --> S[View Login Attempts]
    S --> T[Show Successful/Failed Logins]
    T --> U[Security Alerts]
```

**Security Features:**
- **Session Management**: View and revoke active sessions
- **Password Security**: Strong password requirements and validation
- **Login Monitoring**: Track login attempts and locations
- **Account Recovery**: Secure account recovery process

## 7. Data Export & Privacy Controls

User data management and privacy compliance features.

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant API as Backend API
    participant Export as Export Service
    participant Email as Email Service

    U->>F: Request data export
    F->>API: POST /api/user/export
    API->>Export: Generate user data package
    Export->>Export: Compile watch history, settings, lists
    Export->>Export: Create downloadable archive
    Export-->>API: Export package ready
    API->>Email: Send download link
    Email-->>U: Export ready notification
    API-->>F: Export initiated confirmation
    
    U->>F: Request account deletion
    F->>API: POST /api/user/delete-account
    API->>API: Validate user authentication
    API->>API: Schedule data deletion
    API->>Email: Send confirmation email
    API-->>F: Deletion scheduled
```

**Privacy Features:**
- **Data Export**: Complete user data download
- **Account Deletion**: Secure account removal with data cleanup
- **Privacy Settings**: Control data sharing and analytics
- **GDPR Compliance**: European data protection compliance

## 8. Profile Switching & Session Isolation

Secure profile switching without authentication disruption.

```mermaid
graph TD
    A[User Switches Profile] --> B[Save Current State]
    B --> C[Clear Active Session Data]
    C --> D[Load Target Profile]
    D --> E{Profile Token Valid?}
    E -->|Yes| F[Load Profile Preferences]
    E -->|No| G[Refresh Token]
    G --> H{Refresh Success?}
    H -->|Yes| F
    H -->|No| I[Mark Profile Invalid]
    I --> J[Show Profile Selection]
    F --> K[Apply User Settings]
    K --> L[Load Personalized Content]
    L --> M[Navigate to Home]
    
    B --> N[Persist Watch Progress]
    B --> O[Save UI State]
    N --> C
    O --> C
```

**Profile Isolation Features:**
- **Secure Switching**: Complete session isolation between profiles
- **State Persistence**: Individual watch progress and settings
- **Token Management**: Separate JWT tokens per profile
- **Data Separation**: No cross-profile data leakage

## 9. Parental Controls & Content Filtering

Content filtering and parental control systems (if implemented).

```mermaid
graph TD
    A[Parental Controls] --> B[Content Rating Filters]
    A --> C[Time Restrictions]
    A --> D[Profile Restrictions]
    
    B --> E[Set Rating Limits]
    E --> F[G, PG, PG-13, R filters]
    F --> G[Apply to Profile]
    
    C --> H[Daily Time Limits]
    C --> I[Bedtime Restrictions]
    H --> J[Track Usage Time]
    I --> K[Block During Hours]
    
    D --> L[PIN Protection]
    D --> M[Content Categories]
    L --> N[Require PIN for Access]
    M --> O[Block Specific Genres]
    
    G --> P[Filter Content API Calls]
    J --> Q[Monitor Viewing Time]
    K --> R[Enforce Time Blocks]
    N --> S[Validate PIN Entry]
    O --> P
    
    P --> T[Update Content Display]
    Q --> U[Show Usage Statistics]
    R --> V[Block Access]
    S --> W[Allow/Deny Access]
```

## 10. User Onboarding & First-Time Setup

Guided setup process for new users.

```mermaid
graph TD
    A[First Login Complete] --> B[Welcome Screen]
    B --> C[Setup Wizard]
    C --> D[Content Preferences]
    D --> E[Genre Selection]
    E --> F[Language Preferences]
    F --> G[Quality Settings]
    G --> H[Platform Setup]
    H --> I[Complete Setup]
    I --> J[Personalized Home Screen]
    
    D --> K[Skip Wizard]
    K --> L[Use Default Settings]
    L --> J
    
    E --> M[Popular Genres Grid]
    M --> N[Multi-select Interface]
    N --> F
    
    G --> O[Auto/720p/1080p/4K]
    O --> P[Test Quality Selection]
    P --> H
```

**Onboarding Features:**
- **Content Preferences**: Genre and content type selection
- **Quality Setup**: Bandwidth and quality preference testing
- **Platform Optimization**: TV, mobile, desktop specific setup
- **Skip Options**: Allow experienced users to skip setup

## Technical Implementation

### State Management
- **User State**: `frontend/src/store/slices/app.ts` - User data and authentication
- **Profile State**: `frontend/src/store/slices/profileSelection.ts` - Profile management
- **Settings State**: User preferences and application settings

### Local Storage Architecture
- **Encrypted Profiles**: Secure profile data storage
- **Settings Cache**: Local caching of user preferences
- **Session Management**: JWT token storage and management

### API Integration
- **User API**: Profile management and user data
- **Progress API**: `frontend/src/store/api/progress.ts` - Watch progress tracking
- **Lists API**: `frontend/src/store/api/lists.ts` - Watchlists and favorites

### Security Measures
- **Token Isolation**: Separate tokens per profile
- **Data Encryption**: Sensitive data encryption in local storage
- **Session Validation**: Regular token validation and refresh
- **Secure Cleanup**: Complete data removal on logout/profile deletion

## User Experience Considerations

### Performance
- **Fast Profile Switching**: Instant profile changes with cached data
- **Efficient Sync**: Minimal API calls for settings updates
- **Background Updates**: Progress sync without UI blocking

### Accessibility
- **Settings Navigation**: Full keyboard and screen reader support
- **Visual Preferences**: Font size and contrast options
- **Clear Labels**: Descriptive labels for all settings

### Cross-Platform Consistency
- **Synchronized Settings**: Settings sync across all devices
- **Platform Adaptation**: Interface adaptation for TV, mobile, desktop
- **Universal Access**: Consistent experience across platforms