# 🐱 Miauflix

<div align="center">

![Miauflix Logo](./logo.png)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Powered%20by-Node.js-green)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue)](https://www.docker.com/)
[![CI Status](https://github.com/maury91/miauflix/actions/workflows/ci.yml/badge.svg)](https://github.com/maury91/miauflix/actions/workflows/ci.yml)

**The self-hosted streaming service that meows!**

</div>

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
  - [Currently Available](#currently-available)
  - [In Development](#in-development)
  - [Planned Features](#planned-features)
- [Implementation Status](#implementation-status)
- [Project Architecture](#project-architecture)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Setup](#setup)
- [CI/CD](#cicd)
  - [GitHub Actions](#github-actions)
- [Contributing](#contributing)
- [License](#license)

## 🔍 Overview

Miauflix is a self-hosted media streaming platform that enables users to discover and stream content from various sources. It provides a modern web interface for accessing media content through peer-to-peer streaming technology. Built with Node.js and designed for personal server deployment, Miauflix offers a customizable streaming solution for your media library.

## ✨ Features

### 🚀 Currently Available

- **🔐 User Authentication**: Multi-layered authentication system with comprehensive login flows
  - **API Authentication**: JWT tokens in Authorization headers
  - **Token Renewal**: HttpOnly refresh token cookies (used only for `/api/auth/refresh/:session`)
  - **Streaming Access**: Separate short-lived non-JWT streaming keys for video endpoints
- **🎬 Movie Database**: TMDB integration for posters, ratings, and metadata
- **🔍 Source Discovery**: Automatic search across multiple content directories (YTS and THERARBG with more to come)
- **📺 Video Streaming**: Complete peer-to-peer streaming with quality selection and range requests
- **🛡️ VPN Integration**: Built-in VPN detection and enforcement (optional)
- **📊 Background Processing**: Continuous source discovery and quality scoring
- **🔒 Content Encryption**: All source metadata encrypted at rest with AES-256-GCM
- **🐳 Docker Support**: Ready-to-run containers with nginx and SSL

### 🎯 Planned Features

- **📺 TV Shows**: Episode navigation and season management
- **⛩️ Anime**: Anime support
- **🎯 More Sources**: Additional content directories and indexers ( 1337x, Nyan, Jackett & Prowlarr )
- **📱 Mobile Apps**: Native iOS and Android clients

> **Current Status**: **Production-ready streaming platform!** Backend is 100% complete with full streaming capabilities. Frontend is 100% complete with session-based authentication, comprehensive login system (email + QR code), and complete API integration. The platform is ready for deployment and use.

The application is a self-contained Node.js application. Docker image and docker-compose files are provided for easy server setup. Note: Docker and docker-compose are not mandatory but are recommended as they provide pre-configured VPN and reverse proxy setup.

## 📊 Implementation Status

### ✅ Backend Infrastructure (Complete)

- **Authentication System**: JWT with refresh tokens, role-based access control
- **Streaming Engine**: WebTorrent client with `/api/stream/:token` endpoint
- **Source Aggregation**: Multi-provider discovery (YTS + THERARBG)
- **Database Layer**: SQLite + TypeORM with AES-256-GCM encryption
- **Background Processing**: 7 scheduled tasks for continuous content discovery
- **Security**: VPN detection, audit logging, rate limiting, timing attack protection
- **API Routes**: All endpoints implemented and production-ready

### ✅ Frontend Application (Complete)

- **Build System**: React + Vite + TypeScript with SSR support
- **State Management**: Redux Toolkit with RTK Query for API integration
- **Authentication**: Session-based auth with HttpOnly cookies, email + QR code login
- **UI Components**: Comprehensive component library with Storybook documentation
- **Testing**: Unit tests, visual regression testing, and E2E test infrastructure
- **API Integration**: Complete frontend-backend integration with protected routes

## 🏗️ Project Architecture

```text
miauflix/
├── backend/                  # Node.js TypeScript backend
│   ├── src/                  # Source code
│   └── docs/                 # API documentation
├── frontend/                 # Client application
├── nginx/                    # Nginx configuration
│   ├── conf.d/               # Server blocks
│   │   ├── default.conf      # Active configuration (auto-generated)
│   │   └── default.conf.template # Configuration template
│   ├── certbot/              # Let's Encrypt certificates
│   └── ssl/                  # SSL certificates (auto-generated)
├── scripts/                  # Support scripts
├── setup-git.sh              # Git setup script
├── setup-ssl.sh              # SSL setup wizard
├── docker-compose.yml        # Container orchestration
```

## ⚡ Quick Setup (5 minutes)

> Just want to try it? Here's the fastest path:

```bash
git clone <repository-url> && cd miauflix
docker compose run --rm backend npm run config-only
docker compose up
```

First command runs the configuration wizard (TMDB API key, etc.), then start the full stack. No local Node.js installation needed!

## 🚀 Getting Started

### Prerequisites

- [Docker](https://www.docker.com/) and [Docker Compose](https://docs.docker.com/compose/)
- [Node.js](https://nodejs.org/) (for local development)
- VPN subscription (for VPN functionality, currently only NordVPN is supported)
- [TMDB API Access Token](https://developer.themoviedb.org/docs) (for media content)
- [Trakt.tv API Client ID](https://trakt.tv/oauth/applications) (optional, for list synchronization)

### Setup

#### 1. Clone the repository

```bash
git clone <repository-url>
cd miauflix
```

#### 2. Configure your environment

**Option A: Interactive Configuration Wizard (Recommended)**

Run the configuration wizard directly on your system:

```bash
npm run start:backend
```

Or run it in Docker's interactive mode:

```bash
docker compose run --rm backend npm run start:backend
```

<p align="center">
  <img src="./docs/assets/miauflix%20env%20wizard.gif" alt="Miauflix Environment Setup Wizard" width="800">
</p>

<details>
<summary>What does the configuration wizard do?</summary>

The application includes a sophisticated configuration system that will:

- ✅ Automatically detect missing environment variables
- 🧙‍♂️ Guide you through an interactive setup process
- 🔄 Test API credentials in real-time as you enter them
- 📝 Provide helpful guidance on how to obtain required tokens
- 🔍 Verify configuration before starting the application
- 💾 Save all settings to a `.env` file when completed

</details>

**Option B: Manual Configuration**

Create a `.env` file in the project root directory and configure the required variables:

```bash
# Required for media content
TMDB_API_URL=https://api.themoviedb.org/3
TMDB_API_ACCESS_TOKEN=your_tmdb_token

# Optional for list synchronization
TRAKT_API_URL=https://api.trakt.tv
TRAKT_CLIENT_ID=your_trakt_client_id
```

> **Note**: If running in a non-interactive environment, you'll need to set all required environment variables manually.

#### 3. Set up VPN (Optional)

If you are not planning to use a VPN, you can use the `docker-compose-no-vpn.yml` file (coming soon).

<details>
<summary><b>🔒 NordVPN Setup Instructions</b></summary>

Currently only NordVPN is officially supported. If you want to contribute and use another VPN provider, contributions are welcome!

**NordVPN Configuration:**

1. Follow the [guide in Bubuntux/NordLynx](https://github.com/bubuntux/nordlynx/pkgs/container/nordlynx#how-to-get-your-private_key) to obtain your private key
2. Add your private key to the `.env` file:

```bash
NORDVPN_PRIVATE_KEY=your-nordvpn-private-key
```

</details>

#### 4. Set up HTTPS

Run the interactive SSL setup wizard:

```bash
chmod +x setup-ssl.sh
./setup-ssl.sh -d yourdomain.com
```

<details>
<summary><b>🔐 SSL Setup Details</b></summary>

This wizard will:

- 🔍 Guide you through domain verification and troubleshooting
- 📜 Help set up Let's Encrypt certificates (recommended for production)
- 🔒 Or create self-signed certificates (for development/testing)
- 📋 Provide step-by-step assistance with clear prompts
- ⚙️ Handle validation, certificate requests, and Nginx configuration

For detailed information, see:

- [SSL Certificates Guide](docs/setup/ssl-certificates.md)
</details>

#### 5. Start the Docker Compose environment

```bash
docker compose up -d
```

#### 6. Access the application

- 🌐 App origin: `https://yourdomain.com/`
- 🧭 API base: `https://yourdomain.com/api`
- ✅ Health check: `https://yourdomain.com/api/health`

## 💻 Local Development

For local development without Docker:

### Frontend Development

```bash
# Install dependencies
npm install

# Start frontend with hot reload (recommended for development)
npm run start:frontend
# or
npm run dev:frontend
```

The frontend development server provides:

- ✅ **Hot reload** - Changes appear instantly without manual refresh
- 🔥 **Fast feedback** - Perfect for UI development and styling
- 🚀 **Client-side rendering** - No SSR overhead during development

### Frontend SSR Testing

```bash
# Test with Server-Side Rendering (for production-like behavior)
npm run dev:frontend:ssr
```

Use SSR mode when:

- 🔍 **Testing SSR functionality** - Debug server-side rendering issues
- 🎯 **Production verification** - Ensure production-like behavior
- 📱 **SEO testing** - Verify meta tags and initial page load

> **Note**: SSR mode requires manual rebuild after changes - use regular dev mode for active development.

### Backend Development

```bash
# Interactive configuration and start
npm run start:backend

# Development with Docker (includes mock data)
npm run start:backend:e2e
```

## 🔄 CI/CD

This project uses GitHub Actions for continuous integration and testing. Tests run automatically in networkless mode using pre-recorded fixtures. For more details, see the [CI/CD Guide](docs/development/ci-cd-guide.md).

## 📚 Documentation

For comprehensive guides and development resources, see our [Documentation](docs/README.md):

- **[Setup Guides](docs/setup/)** - Installation, Docker, and HTTPS setup
- **[Development](docs/development/)** - Workflow, testing, and coding standards
- **[Architecture](docs/architecture/)** - System overview and technical details
- **[AI Assistance](docs/ai/)** - Guidelines for AI development tools

## 🤝 Contributing

Contributions are welcome and appreciated! Here's how you can contribute:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Follow the [Development Workflow](docs/development/workflow.md)
4. Commit your changes: `git commit -m 'Add amazing feature'`
5. Push to the branch: `git push origin feature/amazing-feature`
6. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<div align="center">
  <p>Built with 😻 by the Miauflix team</p>
</div>
