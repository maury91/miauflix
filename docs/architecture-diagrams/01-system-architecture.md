# System Architecture Overview

## Miauflix System Architecture Diagram

```mermaid
graph TB
    subgraph "User Interfaces"
        WEB[Web Browser<br/>React SPA]
        TV[Samsung Tizen TV<br/>Smart TV App]
        MOBILE[Mobile Browser<br/>Responsive UI]
    end

    subgraph "Load Balancer & SSL"
        NGINX[Nginx Reverse Proxy<br/>SSL Termination<br/>Rate Limiting]
        CERT[Certbot<br/>Let's Encrypt<br/>Auto-renewal]
    end

    subgraph "VPN Network Protection"
        VPN[NordVPN Container<br/>WireGuard Protocol<br/>Traffic Anonymization]
    end

    subgraph "Backend Application Layer"
        API[Hono API Server<br/>v4.7.10<br/>TypeScript]
        AUTH[Authentication Service<br/>JWT + JOSE<br/>Role-based Access]
        MEDIA[Media Service<br/>TMDB Integration<br/>Content Management]
        SOURCE[Source Service<br/>Torrent Discovery<br/>Quality Scoring]
        SCHEDULER[Task Scheduler<br/>Background Jobs<br/>Automated Sync]
    end

    subgraph "Data Storage Layer"
        DB[(SQLite Database<br/>TypeORM v0.3.10<br/>ACID Transactions)]
        CACHE[Cache Layer<br/>Keyv + SQLite<br/>API Response Cache]
        FILES[File Storage<br/>Torrent Files<br/>Media Metadata]
    end

    subgraph "Torrent Infrastructure"
        WT[WebTorrent Client<br/>v2.6.7<br/>P2P Streaming]
        MAGNET[Magnet Service<br/>Link Processing<br/>Torrent Validation]
        TRACKER[Tracker Service<br/>Distributed Discovery<br/>Source Verification]
    end

    subgraph "External APIs"
        TMDB[TMDB API<br/>Movie/TV Metadata<br/>Images & Details]
        YTS1[YTS Mirror 1<br/>yts.mx]
        YTS2[YTS Mirror 2<br/>yts.lt]
        YTS3[YTS Mirror 3<br/>yts.am]
        YTS4[YTS Mirror 4<br/>yts.ag]
        YTS5[YTS Mirror 5<br/>yts.rs]
        TRAKT[Trakt.tv API<br/>Optional Integration<br/>User Activity Sync]
    end

    subgraph "Security & Monitoring"
        AUDIT[Audit Log Service<br/>Security Events<br/>Compliance Tracking]
        ENCRYPT[Encryption Service<br/>Field-level Encryption<br/>Data Protection]
        VPN_MONITOR[VPN Monitor<br/>Connection Health<br/>Auto-reconnect]
    end

    %% User Interface Connections
    WEB --> NGINX
    TV --> NGINX
    MOBILE --> NGINX

    %% SSL and Load Balancing
    NGINX --> API
    CERT -.-> NGINX

    %% VPN Protection
    API --> VPN
    VPN --> WT
    VPN --> SOURCE

    %% Internal Service Connections
    API --> AUTH
    API --> MEDIA
    API --> SOURCE
    API --> SCHEDULER

    %% Data Layer Connections
    AUTH --> DB
    MEDIA --> DB
    SOURCE --> DB
    SCHEDULER --> DB
    API --> CACHE

    %% Torrent Infrastructure
    SOURCE --> WT
    SOURCE --> MAGNET
    SOURCE --> TRACKER
    WT --> FILES

    %% External API Connections
    MEDIA --> TMDB
    SOURCE --> YTS1
    SOURCE --> YTS2
    SOURCE --> YTS3
    SOURCE --> YTS4
    SOURCE --> YTS5
    AUTH --> TRAKT

    %% Security Services
    AUTH --> AUDIT
    DB --> ENCRYPT
    VPN --> VPN_MONITOR
    AUDIT --> DB

    %% Styling
    classDef frontend fill:#e1f5fe,stroke:#01579b,stroke-width:2px
    classDef backend fill:#e8f5e8,stroke:#2e7d32,stroke-width:2px
    classDef database fill:#fff3e0,stroke:#ef6c00,stroke-width:2px
    classDef external fill:#ffebee,stroke:#c62828,stroke-width:2px
    classDef security fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
    classDef infrastructure fill:#e0f2f1,stroke:#00695c,stroke-width:2px

    class WEB,TV,MOBILE frontend
    class API,AUTH,MEDIA,SOURCE,SCHEDULER backend
    class DB,CACHE,FILES database
    class TMDB,YTS1,YTS2,YTS3,YTS4,YTS5,TRAKT external
    class AUDIT,ENCRYPT,VPN_MONITOR security
    class NGINX,CERT,VPN,WT,MAGNET,TRACKER infrastructure
```

## Component Overview

### Frontend Layer (Blue)

- **React SPA**: Modern single-page application with Redux state management
- **Cross-platform**: Web browsers, Samsung Tizen Smart TVs, mobile responsive
- **Real-time UI**: Dynamic content updates and streaming interface

### Backend Services (Green)

- **Hono API**: Lightweight, fast web framework with TypeScript
- **Service Architecture**: Modular services with clear separation of concerns
- **Authentication**: JWT-based authentication with role-based access control
- **Media Management**: Content discovery, metadata management, quality scoring
- **Background Processing**: Automated synchronization and maintenance tasks

### Data Layer (Orange)

- **SQLite Database**: File-based database with TypeORM for entity management
- **Caching**: Multi-level caching for API responses and metadata
- **File Storage**: Efficient storage for torrent files and media assets

### External Integrations (Red)

- **TMDB API**: Comprehensive movie and TV show metadata
- **YTS Mirrors**: Multiple redundant torrent sources for reliability
- **Trakt.tv**: Optional user activity synchronization

### Security Layer (Purple)

- **Audit Logging**: Comprehensive security event tracking
- **Encryption**: Field-level database encryption for sensitive data
- **VPN Monitoring**: Continuous VPN connection health checks

### Infrastructure (Teal)

- **Nginx**: Reverse proxy with SSL termination and rate limiting
- **VPN Integration**: NordVPN container for traffic anonymization
- **Torrent Client**: WebTorrent for P2P streaming capabilities
- **SSL Management**: Automated certificate provisioning and renewal

## Key Architectural Principles

1. **Security-First Design**: All torrent traffic routed through VPN, comprehensive audit logging
2. **Scalable Architecture**: Modular services with clear APIs and separation of concerns
3. **Reliability**: Multiple failover mechanisms and redundant external sources
4. **Performance**: Multi-level caching and optimized database queries
5. **Privacy Protection**: Encrypted storage and anonymized network traffic

## Technology Stack Summary

- **Frontend**: React 18.2.0, Redux Toolkit 1.9.7, Styled Components 6.1.1
- **Backend**: Hono 4.7.10, TypeORM 0.3.10, SQLite 5.0.11
- **Torrent**: WebTorrent 2.6.7, Distributed trackers
- **Infrastructure**: Docker, NordVPN, Nginx, Let's Encrypt
- **Security**: JOSE JWT, bcrypt, field-level encryption
