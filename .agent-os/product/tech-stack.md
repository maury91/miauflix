# Technical Stack

## Overview

Miauflix is built with a focus on performance, security, and universal deployment capabilities, using modern technologies optimized for self-hosted streaming platforms.

## Core Technologies

**Application Framework:** Node.js 22 LTS with ESM modules
**Backend Framework:** Hono (Express-like but faster)
**Primary Database:** SQLite with TypeORM
**JavaScript Framework:** React 19
**Build Tool:** Vite
**Import Strategy:** Node.js modules
**Package Manager:** npm (workspaces)
**CSS Framework:** styled-components
**UI Component Library:** Custom components (no external library)
**Font Provider:** System fonts
**Icon Library:** Custom SVG icons
**Testing Framework:** Jest + Playwright

## Backend Stack

**Runtime:** Node.js 22 with ESM modules
**Web Framework:** Hono (lightweight, fast HTTP framework)
**Database ORM:** TypeORM
**Database System:** SQLite (production-ready for self-hosted use)
**Authentication:** JWT tokens + HttpOnly refresh cookies
**Encryption:** AES-256-GCM (built-in EncryptionService)
**Streaming:** WebTorrent client integration
**External APIs:** TMDB, Trakt.tv, NordVPN

## Frontend Stack

**Framework:** React 19
**Build Tool:** Vite
**State Management:** Redux Toolkit
**Styling:** styled-components
**Routing:** Custom routing (NO react-router)
**Bundle Strategy:** Code splitting with lazy loading

## Infrastructure

**Application Hosting:** Universal deployment (RaspberryPi to cloud)
**Database Hosting:** Self-hosted SQLite
**Asset Hosting:** Self-hosted (served by backend)
**Deployment Solution:** Single binary deployment
**Container Support:** Docker + Docker Compose
**Code Repository:** Git-based

## Development Tools

**Language:** TypeScript (strict mode)
**Linting:** ESLint
**Formatting:** Prettier
**Testing:** 2-tier strategy (Jest unit tests + Playwright E2E)
**CI/CD:** GitHub Actions compatible
**Environment:** Development, E2E, Production modes

## Security & Privacy

**Encryption:** AES-256-GCM for sensitive data
**VPN Integration:** NordVPN API integration
**Audit Logging:** Comprehensive security event logging
**Rate Limiting:** Built-in protection against abuse
**Authentication:** JWT access tokens + HttpOnly refresh cookies
**Streaming Security:** Non-JWT streaming keys with timing attack protection

## External Services

**Content Metadata:** TMDB API
**Recommendations:** Trakt.tv API  
**VPN Services:** NordVPN API
**Content Sources:** YTS, THERARBG (torrent providers)

## Deployment Characteristics

**Single Binary:** Compiled to single executable
**Database:** Embedded SQLite (no external DB required)
**Static Assets:** Served by backend (no separate CDN required)
**Configuration:** Environment variables + interactive wizard
**Scaling:** Optimized for 1-10 concurrent users per instance
**Platform Support:** Linux, macOS, Windows, ARM (RaspberryPi)
