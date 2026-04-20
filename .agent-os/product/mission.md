# Product Mission

## Pitch

Miauflix is a self-hosted universal streaming platform that helps privacy-conscious hobbyists stream content securely by providing intelligent predictive streaming with one-click deployment across any environment from RaspberryPi to hostile cloud infrastructure.

## Users

### Primary Customers

- **Privacy-Conscious Hobbyists**: Individuals who want complete control over their streaming infrastructure and data
- **Self-Hosting Enthusiasts**: Technical users who prefer running their own services rather than relying on commercial platforms
- **Small Group Administrators**: People managing streaming for families, friend groups, or small communities (1-10 concurrent users)

### User Personas

**Privacy-First Hobbyist** (25-45 years old)

- **Role:** Software Developer / IT Professional
- **Context:** Runs multiple self-hosted services, values data ownership and privacy
- **Pain Points:** Commercial streaming services are expensive, geographically restricted, and track viewing habits
- **Goals:** Access content privately, maintain full control over infrastructure, avoid vendor lock-in

**Self-Hosting Power User** (30-50 years old)

- **Role:** System Administrator / DevOps Engineer
- **Context:** Manages personal or small group technology infrastructure
- **Pain Points:** Existing self-hosted media solutions are complex to set up and maintain, lack modern features
- **Goals:** Deploy quickly, customize extensively, integrate with existing infrastructure

## The Problem

### Streaming Platform Vendor Lock-in

Commercial streaming platforms fragment content across multiple expensive subscriptions, apply geographic restrictions, and track user behavior. Users lose access when subscriptions end or content is removed.

**Our Solution:** Miauflix provides a unified, self-hosted streaming experience with complete user control and privacy.

### Complex Self-Hosted Media Solutions

Existing self-hosted media solutions require extensive technical knowledge, complex multi-service deployments, and ongoing maintenance overhead. They often lack modern streaming features and mobile apps.

**Our Solution:** Miauflix offers one-click deployment with intelligent defaults while maintaining full customization capabilities.

### Hostile Environment Deployment

Privacy-conscious users need to deploy streaming services in environments where media streaming may be restricted or monitored, requiring encryption and VPN integration.

**Our Solution:** Miauflix includes built-in AES-256-GCM encryption, VPN integration, and security features designed for hostile environments.

## Differentiators

### Intelligent Predictive Streaming

Unlike traditional torrent clients that require manual management, Miauflix automatically discovers, pre-fetches, and optimizes content based on user preferences and viewing patterns. This results in Netflix-like instant streaming from P2P sources.

### Security-First Architecture

Unlike other self-hosted media solutions, Miauflix includes comprehensive encryption, VPN integration, audit logging, and security features by default. This enables safe deployment in any environment without additional configuration.

### Universal Deployment

Unlike complex multi-container solutions, Miauflix provides true one-click deployment that scales from RaspberryPi to enterprise cloud environments while maintaining the same feature set and performance characteristics.

## Key Features

### Core Features

- **WebTorrent P2P Streaming:** Instant streaming from peer-to-peer sources with automatic quality selection
- **Multi-Provider Aggregation:** Searches across multiple torrent providers (YTS, THERARBG) for optimal content discovery
- **Intelligent Content Discovery:** Background processing for predictive content fetching and recommendations
- **One-Click Deployment:** Single binary deployment with automatic configuration and environment detection

### Security Features

- **AES-256-GCM Encryption:** All sensitive data encrypted at rest with industry-standard encryption
- **VPN Integration:** Built-in NordVPN integration with automatic detection and enforcement
- **Security Audit Logging:** Comprehensive logging of all security-relevant events and user actions
- **Rate Limiting & Protection:** Built-in protection against timing attacks and abuse

### Integration Features

- **TMDB Integration:** Rich movie and TV show metadata with poster images and detailed information
- **Trakt.tv Sync:** Cross-platform recommendation sync and viewing history management
- **JWT Authentication:** Secure token-based authentication with refresh token support
- **RESTful API:** Complete API for integration with mobile apps and third-party tools
