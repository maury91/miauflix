# 🐱 Miauflix

<div align="center">

![Miauflix Logo](./assets/logo.png)

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

## Philosphy

Miauflix is based on these principles:

### Simplicity

Starting Miauflix in your machine or VPS must be as easy as possible.  
The setup is meant to accommodate both beginners and advanced users.

If you are a beginner using Miauflix in your local machine, you can just run the wizard and start one single docker image, you don't even need to download this repository.

If you are an advanced user, everything is readu for you to setup a full website with SSL, custom domain, VPN and everything you might need.

### Resilience

Miauflix is designed to be able to work with multiple different sources, many are simply integrated with the codebase so you can use them without the need of installing anything else ( simplicity principle ).  
Others can be added so Miauflix can still work even if those sources are not available anymore.

> Note: This pricinple is not fully implemented yet, and integration with Prowlarr and Jackett is planned.

### Running everywhere

Miauflix is designed so you can run it in a possibly hostile environment, like a VPS that is partially monitored by the provider.

### First part: obfuscation

Miauflix will by default encrypt all sensitive data at rest, however, Miauflix will still need to have access to the decryption key, that means that if Miauflix can access it also the provider of the VPN can access it. This is only meant to obfuscate the data, scanning tools will most likely not be able to detect this data ( majority of them will search for specific hashes, keywords, patterns, etc; with obfuscation they will simply see it as garbage ), however, if a human decides to look into the system and starts reading the code, they will be able to decrypt the data.

Miauflix doesn't encrypt any data in transit, this is the job of the VPN.

![encryption-flow](./assets/encryption-flow.png)

### Second part: authentication

Miauflix in order to be able to run outside of your local network, needs to support user authentication.

Miauflix provides a closed authentication system, it provides you with an admin user that can create other users, it does not provide a self signup system.

The purpose is to let you deploy your instance of Miauflix in a server exposed to the internet, while ensuring only authorized users can access it.

## Speed

Miauflix is designed to allow you to stream content as fast as possible. The tenant is simply "when a user clicks on Watch Now, streaming should start in less than 2 seconds".

To allow this Miauflix uses a combination of background processing, preloading and priority queue.

When Miauflix is idle, it will constantly search for new content and preload the necessary data for streaming.

- Periodic synchronization of TMDB and Trakt.tv lists
- Periodic source discovery of recently acquired content, and re-discovery of old content
- Pre-download of content that the user marked as "continue watching" ( example: new episode of a TV show )

Miauflix will give high priority to the content the user shows intention to watch ( example: when a user clicks on the details of a movie ), if not present the data will be obtained on the fly with absolute priority over the rest, it will also start downloading the content so when the user clicks on Watch Now, a part of the content is already downloaded.

Miauflix supports streaming while downloading.

## ✨ Features

### 🚀 Currently Available

- **🔐 User Authentication**: Multi-layered authentication system with comprehensive login flows
- **🎬 Movie Database**: TMDB integration for posters, ratings, and metadata
- **🔍 Source Discovery**: Automatic search across multiple content directories (YTS and THERARBG with more to come)
- **📺 Video Streaming**: Complete peer-to-peer streaming with quality selection
- **🛡️ VPN Integration**: Built-in VPN detection and enforcement (optional)
- **📊 Background Processing**: Continuous source discovery and quality scoring
- **🔒 Content Encryption**: All source metadata encrypted at rest with AES-256-GCM
- **🐳 Docker Support**: Ready-to-run containers with nginx and SSL

### 🎯 Planned Features

- **📺 TV Shows**: Episode navigation and season management
- **⛩️ Anime**: Anime support
- **🎯 More Sources**: Additional content directories and indexers ( 1337x, Nyan, Jackett & Prowlarr )
- **📱 Mobile Apps**: Native iOS and Android clients

## 🏗️ Project Architecture

```text
miauflix/
├── backend/                        # Node.js TypeScript backend
│   ├── src/                        # Source code
│   └── docs/                       # API documentation
├── frontend/                       # Client application
│   ├── e2e/                        # End to end tests ( for frontend )
│   ├── storybook/                  # Storybook documentation
│   └── src/                        # Source code
|── packages/                       # Shared libraries
│   ├── backend-client/             # Generated API client
│   ├── *-sanitizer/                # Source metadata sanitizer ( used for testing )
│   └── source-metadata-extractor/  # Content metadata processing
|── docs/                           # Project documentation
├── nginx/                          # Nginx configuration
│   ├── conf.d/                     # Server blocks
│   │   ├── default.conf            # Active configuration (auto-generated)
│   │   └── default.conf.template   # Configuration template
│   ├── certbot/                    # Let's Encrypt certificates
│   └── ssl/                        # SSL certificates (auto-generated)
├── backend-e2e/                    # End to end tests ( for backend )
├── scripts/                        # Support scripts
├── docker-compose.yml              # Container orchestration
```

## ⚡ Quick Setup (5 minutes)

> Just want to try it? Here's the fastest path:

```bash
git clone https://github.com/maury91/miauflix.git && cd miauflix
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
git clone https://github.com/maury91/miauflix.git
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
