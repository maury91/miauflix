# Miauflix Documentation

Welcome to the Miauflix documentation! This guide helps you find the right information for your needs.

## Quick Navigation

### 🚀 Getting Started

- **Just want to try it?** Use the [prebuilt images](setup/docker-setup.md#prebuilt-images)
- **New to Miauflix?** Start with [Getting Started](setup/getting-started.md)
- **What can Miauflix do?** Browse the [Feature Guide](features.md)
- **Why it works the way it does?** Read the [Philosophy](philosophy.md)
- **Docker deployment?** See [Docker Setup](setup/docker-setup.md)
- **HTTPS configuration?** Check [HTTPS with a domain](setup/docker-setup.md#https-with-a-domain)
- **Cloudflare bypass?** See [FlareSolverr Configuration](setup/flaresolverr.md)

### 💻 Development

- **Contributing?** Read the [Development Workflow](development/workflow.md)
- **Testing?** Follow the [Testing Guide](development/testing-guide.md)
- **CI/CD?** Check the [CI/CD Guide](development/ci-cd-guide.md)
- **Code standards?** See [Coding Conventions](development/coding-conventions.md)

### 🏗️ Architecture

- **Architecture references?** Start with the [Architecture index](architecture/README.md)
- **System overview?** Read [System Architecture](architecture/system-overview.md)
- **Service and data flows?** See [Architecture Diagrams](architecture/diagrams.md)
- **Technical details?** See [Backend Documentation](../backend/docs/) and the service READMEs ([sources](../services/sources/README.md), [media-load](../services/media-load/README.md), [media catalog](../services/media-catalog/README.md))

### 🗺️ Plans

- **Plans, roadmaps, and past investigations** are kept apart in [plans/](plans/README.md). They do not describe the current system; everything outside that folder does.

## Documentation Structure

```
docs/
├── features.md         # Available features and planned improvements
├── features/           # Detailed feature groups and limitations
├── philosophy.md       # Why it works the way it does
├── setup/              # Setup and deployment
│   ├── getting-started.md       # Main setup guide
│   ├── environment-variables.md # Complete environment variables reference
│   ├── docker-setup.md          # Docker deployment
│   ├── flaresolverr.md          # FlareSolverr Cloudflare bypass
│   └── samsung-tv.md            # Samsung TV app
├── development/        # Development resources
│   ├── workflow.md           # Development workflow and toolchain
│   ├── testing-guide.md      # Testing practices
│   ├── ci-cd-guide.md        # GitHub Actions/CI
│   ├── coding-conventions.md # Code standards
│   ├── css-architecture.md   # Build-time styles (proposal, partly applied)
│   └── bun-compatibility.md  # Bun specifics and the remaining uTP gap
├── architecture/       # Current architecture references (see its README)
└── plans/              # Plans and records: not a description of the current system
```

## Finding What You Need

### I want to...

- **Deploy Miauflix** → [Getting Started](setup/getting-started.md)
- **Develop features** → [Development Workflow](development/workflow.md)
- **Understand the architecture** → [System Overview](architecture/system-overview.md)
- **Run tests** → [Testing Guide](development/testing-guide.md)
- **Set up HTTPS** → [HTTPS with a domain](setup/docker-setup.md#https-with-a-domain)
- **Configure Cloudflare bypass** → [FlareSolverr Configuration](setup/flaresolverr.md)
- **Troubleshoot Docker** → [Docker Setup](setup/docker-setup.md)
- **Follow code standards** → [Coding Conventions](development/coding-conventions.md)

### I'm working on...

- **Backend features** → See [Backend Documentation](../backend/docs/)
- **Frontend components** → [Development Workflow](development/workflow.md)
- **Database changes** → [System Architecture](architecture/system-overview.md#data-layer)
- **API endpoints** → [Backend Documentation](../backend/docs/)

## External Resources

- **Frontend E2E Tests**: [frontend/e2e/](../frontend/e2e/)
- **Current Planned Features**: [ToDo.md](../ToDo.md)
- **Main README**: [README.md](../README.md)

---

**Need help?** Check the relevant guide above or review the [main project README](../README.md) for additional resources.
