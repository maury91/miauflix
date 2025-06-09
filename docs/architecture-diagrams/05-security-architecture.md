# Security Architecture

## Multi-Layer Security Design

### 1. Security Architecture Overview

```mermaid
flowchart TB
    subgraph "External Layer"
        INTERNET[Internet Traffic]
    end

    subgraph "SSL/TLS Layer"
        LETSENCRYPT[Let's Encrypt<br/>Certificate Authority]
        SSL_TERM[SSL Termination<br/>Nginx Reverse Proxy]
        CERT_RENEWAL[Automated Certificate<br/>Renewal Process]
    end

    subgraph "Network Security Layer"
        VPN_CONTAINER[NordVPN Container<br/>WireGuard Protocol]
        VPN_MONITOR[VPN Health Monitor<br/>Connection Validation]
        TRAFFIC_ISOLATION[Traffic Isolation<br/>Torrent ↔ VPN Only]
    end

    subgraph "Application Security Layer"
        RATE_LIMIT[Rate Limiting<br/>API Protection]
        CORS[CORS Policy<br/>Origin Validation]
        JWT_AUTH[JWT Authentication<br/>JOSE Library]
        RBAC[Role-Based Access<br/>User/Admin/Guest]
    end

    subgraph "Data Security Layer"
        FIELD_ENCRYPTION[Field-Level Encryption<br/>Sensitive Data Protection]
        HASH_PASSWORDS[Password Hashing<br/>bcrypt Algorithm]
        TOKEN_SECURITY[Secure Token Storage<br/>Refresh Token Rotation]
        INPUT_VALIDATION[Input Validation<br/>Zod Schema Validation]
    end

    subgraph "Audit & Monitoring Layer"
        AUDIT_LOG[Audit Logging<br/>Security Event Tracking]
        SECURITY_HEADERS[Security Headers<br/>HSTS, CSP, X-Frame]
        ERROR_HANDLING[Secure Error Handling<br/>No Information Leakage]
    end

    %% Flow connections
    INTERNET --> SSL_TERM

    LETSENCRYPT --> SSL_TERM
    CERT_RENEWAL --> SSL_TERM

    SSL_TERM --> RATE_LIMIT
    SSL_TERM --> CORS

    RATE_LIMIT --> JWT_AUTH
    CORS --> JWT_AUTH
    JWT_AUTH --> RBAC

    RBAC --> FIELD_ENCRYPTION
    RBAC --> INPUT_VALIDATION
    FIELD_ENCRYPTION --> HASH_PASSWORDS
    INPUT_VALIDATION --> TOKEN_SECURITY

    VPN_CONTAINER --> TRAFFIC_ISOLATION
    VPN_MONITOR --> VPN_CONTAINER
    TRAFFIC_ISOLATION --> AUDIT_LOG

    AUDIT_LOG --> SECURITY_HEADERS
    SECURITY_HEADERS --> ERROR_HANDLING

    %% Styling
    classDef external fill:#ffebee,stroke:#c62828,stroke-width:2px
    classDef ssl fill:#e8f5e8,stroke:#2e7d32,stroke-width:2px
    classDef network fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
    classDef application fill:#fff3e0,stroke:#f57c00,stroke-width:2px
    classDef data fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
    classDef audit fill:#e0f2f1,stroke:#00695c,stroke-width:2px

    class INTERNET external
    class LETSENCRYPT,SSL_TERM,CERT_RENEWAL ssl
    class VPN_CONTAINER,VPN_MONITOR,TRAFFIC_ISOLATION network
    class RATE_LIMIT,CORS,JWT_AUTH,RBAC application
    class FIELD_ENCRYPTION,HASH_PASSWORDS,TOKEN_SECURITY,INPUT_VALIDATION data
    class AUDIT_LOG,SECURITY_HEADERS,ERROR_HANDLING audit
```

### 2. Authentication & Authorization Flow

```mermaid
sequenceDiagram
    participant U as User
    participant N as Nginx
    participant A as Hono middleware
    participant AUTH as Auth Service
    participant E as Encryption Service
    participant AUDIT as Audit Service
    participant DB as Database

    Note over U,DB: Secure Authentication Process

    U->>N: HTTPS Request with credentials
    N->>N: SSL Termination & Security Headers
    N->>A: Forward to API (internal network)
    A->>A: Rate limiting check
    A->>AUTH: Authenticate user

    AUTH->>E: Request password verification
    E->>DB: Retrieve encrypted password hash
    DB-->>AUTH: Return encrypted data

    AUTH->>AUTH: bcrypt password comparison

    alt Authentication Success
        AUTH->>AUTH: Generate JWT tokens (access + refresh)
        AUTH->>AUDIT: Log successful authentication
        AUTH->>DB: Store refresh token (encrypted)
        AUTH-->>A: Return JWT tokens
        A-->>N: Return authentication response
        N-->>U: Secure HTTPS response
    else Authentication Failure
        AUTH->>AUDIT: Log failed authentication attempt
        AUDIT->>DB: Store security event
        AUTH-->>A: Return authentication error
        A-->>N: Return error response
        N-->>U: Secure error response
    end

    Note over U,DB: All sensitive operations audited and encrypted
```

### 3. VPN Security Integration

```mermaid
flowchart TD
    subgraph "Container Network"
        BACKEND[Backend Container<br/>Miauflix API]
        VPN[NordVPN Container<br/>WireGuard Protocol]
        NGINX[Nginx Container<br/>Reverse Proxy]
    end

    subgraph "VPN Security Features"
        PRIVATE_KEY[Private Key Authentication<br/>No Username/Password]
        KILL_SWITCH[Network Kill Switch<br/>No Bypass Possible]
        DNS_LEAK[DNS Leak Protection<br/>VPN DNS Only]
        IP_ROTATION[IP Address Rotation<br/>Geographic Distribution]
    end

    subgraph "Traffic Routing"
        NORMAL_TRAFFIC[Normal API Traffic<br/>Direct Internet]
        TORRENT_TRAFFIC[Torrent Traffic<br/>Through VPN Only]
        EXTERNAL_API[External API Calls<br/>TMDB, YTS, etc.]
    end

    subgraph "Monitoring & Health"
        VPN_STATUS[VPN Status Monitor<br/>Connection Health Check]
        AUTO_RECONNECT[Auto Reconnection<br/>Service Recovery]
        FAILSAFE[Failsafe Mechanism<br/>Block on VPN Failure]
    end

    %% Network routing
    BACKEND --> VPN
    VPN --> TORRENT_TRAFFIC
    BACKEND --> NORMAL_TRAFFIC
    BACKEND --> EXTERNAL_API

    %% VPN features
    VPN --> PRIVATE_KEY
    VPN --> KILL_SWITCH
    VPN --> DNS_LEAK
    VPN --> IP_ROTATION

    %% Monitoring
    VPN_STATUS --> VPN
    AUTO_RECONNECT --> VPN
    FAILSAFE --> VPN

    %% Traffic isolation
    TORRENT_TRAFFIC -.->|Only Route| VPN
    NORMAL_TRAFFIC -.->|Direct Route| NGINX
    EXTERNAL_API -.->|API Calls| NGINX

    %% Styling
    classDef container fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
    classDef security fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
    classDef traffic fill:#fff3e0,stroke:#f57c00,stroke-width:2px
    classDef monitoring fill:#e8f5e8,stroke:#2e7d32,stroke-width:2px

    class BACKEND,VPN,NGINX container
    class PRIVATE_KEY,KILL_SWITCH,DNS_LEAK,IP_ROTATION security
    class NORMAL_TRAFFIC,TORRENT_TRAFFIC,EXTERNAL_API traffic
    class VPN_STATUS,AUTO_RECONNECT,FAILSAFE monitoring
```

### 4. Data Protection & Encryption

```mermaid
flowchart LR
    subgraph "Data at Rest"
        DB_FILES[(Database Files<br/>SQLite Storage)]
        SENSITIVE_FIELDS[Sensitive Fields<br/>Encrypted Storage]
        USER_PASSWORDS[User Passwords<br/>bcrypt Hashing]
        API_KEYS[API Keys & Tokens<br/>Field Encryption]
    end

    subgraph "Data in Transit"
        HTTPS_TLS[HTTPS/TLS 1.3<br/>Client ↔ Server]
        VPN_ENCRYPTION[VPN Encryption<br/>WireGuard Protocol]
        INTERNAL_COMM[Internal Communication<br/>Container Network]
    end

    subgraph "Encryption Services"
        FIELD_CRYPTO[Field-Level Cryptography<br/>AES-256 Encryption]
        KEY_MANAGEMENT[Key Management<br/>Environment Variables]
        SALT_GENERATION[Salt Generation<br/>Cryptographically Secure]
        IV_RANDOMIZATION[IV Randomization<br/>Unique per Operation]
    end

    subgraph "Data Validation"
        INPUT_SANITIZATION[Input Sanitization<br/>XSS Prevention]
        SCHEMA_VALIDATION[Schema Validation<br/>Zod Type Safety]
        SQL_INJECTION[SQL Injection Prevention<br/>TypeORM Parameterization]
        RATE_VALIDATION[Rate Limit Validation<br/>Request Throttling]
    end

    %% Data protection flows
    DB_FILES --> FIELD_CRYPTO
    SENSITIVE_FIELDS --> FIELD_CRYPTO
    USER_PASSWORDS --> SALT_GENERATION
    API_KEYS --> KEY_MANAGEMENT

    %% Transit encryption
    HTTPS_TLS --> VPN_ENCRYPTION
    VPN_ENCRYPTION --> INTERNAL_COMM

    %% Encryption services
    FIELD_CRYPTO --> KEY_MANAGEMENT
    FIELD_CRYPTO --> IV_RANDOMIZATION
    SALT_GENERATION --> FIELD_CRYPTO

    %% Validation flows
    INPUT_SANITIZATION --> SCHEMA_VALIDATION
    SCHEMA_VALIDATION --> SQL_INJECTION
    SQL_INJECTION --> RATE_VALIDATION

    %% Styling
    classDef storage fill:#fff3e0,stroke:#ef6c00,stroke-width:2px
    classDef transit fill:#e8f5e8,stroke:#2e7d32,stroke-width:2px
    classDef crypto fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
    classDef validation fill:#e1f5fe,stroke:#0277bd,stroke-width:2px

    class DB_FILES,SENSITIVE_FIELDS,USER_PASSWORDS,API_KEYS storage
    class HTTPS_TLS,VPN_ENCRYPTION,INTERNAL_COMM transit
    class FIELD_CRYPTO,KEY_MANAGEMENT,SALT_GENERATION,IV_RANDOMIZATION crypto
    class INPUT_SANITIZATION,SCHEMA_VALIDATION,SQL_INJECTION,RATE_VALIDATION validation
```

### 5. Security Headers & Policies

```mermaid
flowchart TD
    NGINX_CONFIG[Nginx Security Configuration] --> SECURITY_HEADERS[Security Headers Implementation]

    SECURITY_HEADERS --> HSTS[HTTP Strict Transport Security<br/>max-age=31536000; includeSubDomains]
    SECURITY_HEADERS --> CSP[Content Security Policy<br/>script-src self; object-src none]
    SECURITY_HEADERS --> X_FRAME[X-Frame-Options<br/>DENY]
    SECURITY_HEADERS --> X_CONTENT[X-Content-Type-Options<br/>nosniff]
    SECURITY_HEADERS --> REFERRER[Referrer-Policy<br/>strict-origin-when-cross-origin]
    SECURITY_HEADERS --> PERMISSIONS[Permissions-Policy<br/>geolocation none; microphone none]

    NGINX_CONFIG --> RATE_LIMITING[Rate Limiting Configuration]
    RATE_LIMITING --> ENDPOINT_LIMITS[Per-Endpoint Rate Limits<br/>Individual endpoint controls]
    RATE_LIMITING --> AUTH_LIMITS[Auth Rate Limits<br/>Login/register endpoints]
    RATE_LIMITING --> STREAM_LIMITS[Streaming Rate Limits<br/>Video/torrent endpoints]

    NGINX_CONFIG --> SSL_CONFIG[SSL/TLS Configuration]
    SSL_CONFIG --> TLS_VERSION[TLS Version<br/>1.2+ Only]
    SSL_CONFIG --> CIPHER_SUITE[Cipher Suites<br/>Perfect Forward Secrecy]
    SSL_CONFIG --> CERT_VALIDATION[Certificate Validation<br/>OCSP Stapling]

    %% Styling
    classDef config fill:#e3f2fd,stroke:#1976d2,stroke-width:3px
    classDef headers fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
    classDef limits fill:#fff3e0,stroke:#f57c00,stroke-width:2px
    classDef ssl fill:#e8f5e8,stroke:#2e7d32,stroke-width:2px

    class NGINX_CONFIG config
    class SECURITY_HEADERS,HSTS,CSP,X_FRAME,X_CONTENT,REFERRER,PERMISSIONS headers
    class RATE_LIMITING,ENDPOINT_LIMITS,AUTH_LIMITS,STREAM_LIMITS limits
    class SSL_CONFIG,TLS_VERSION,CIPHER_SUITE,CERT_VALIDATION ssl
```

## Security Implementation Details

### Authentication Security

- **JWT Tokens**: JOSE library for secure token generation and validation
- **Refresh Tokens**: Secure rotation with database storage
- **Password Hashing**: bcrypt with configurable rounds
- **Role-Based Access**: User, Admin, Guest roles with strict enforcement

### Data Protection

- **Field-Level Encryption**: AES-256 encryption for sensitive database fields
- **Key Management**: Environment-based key storage with rotation support
- **Input Validation**: Zod schema validation for all API inputs
- **SQL Injection Prevention**: TypeORM parameterized queries

### Network Security

- **VPN Integration**: All torrent traffic routed through NordVPN
- **SSL/TLS**: Let's Encrypt certificates with automatic renewal
- **Security Headers**: Comprehensive security header implementation
- **Rate Limiting**: Multi-level rate limiting for API protection

### Infrastructure Security

- **Container Isolation**: Docker container-based service isolation
- **Network Policies**: Restricted inter-service communication
- **Secret Management**: Environment variable-based configuration
- **Health Monitoring**: Continuous security service monitoring

### Audit & Compliance

- **Security Event Logging**: Comprehensive audit trail for security events
- **Access Logging**: Detailed access logs with IP and user agent tracking
- **Error Handling**: Secure error responses without information leakage
- **Data Retention**: Configurable retention policies for audit data

### Threat Mitigation

#### Common Attack Vectors

1. **SQL Injection**: Prevented by TypeORM parameterized queries
2. **XSS Attacks**: Mitigated by CSP headers and input sanitization
3. **CSRF Attacks**: Protected by SameSite cookies and origin validation
4. **Brute Force**: Rate limiting and account lockout mechanisms
5. **Man-in-the-Middle**: HTTPS/TLS encryption and HSTS headers
6. **Data Breaches**: Field-level encryption and access controls

#### Privacy Protection

1. **Torrent Anonymization**: VPN routing for all P2P traffic
2. **User Data Protection**: Encrypted storage of sensitive information
3. **Access Controls**: Role-based permissions and audit logging
4. **Data Minimization**: Only necessary data collection and storage

### Security Monitoring

#### Real-time Monitoring

- **VPN Connection Status**: Continuous health checks
- **Authentication Failures**: Failed login attempt tracking
- **Rate Limit Violations**: Suspicious activity detection
- **Security Header Compliance**: Header validation monitoring

#### Security Metrics

- **Authentication Success Rate**: Monitor authentication patterns
- **API Response Times**: Detect potential DoS attacks
- **VPN Uptime**: Ensure continuous privacy protection
- **Error Rates**: Monitor application security health

This security architecture provides comprehensive protection across all layers of the Miauflix system, ensuring user privacy, data protection, and system integrity while maintaining optimal performance and usability.
