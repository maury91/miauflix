# Roo Code Configuration

This directory contains the specialized Roo Code configuration for the miauflix project. The configuration optimizes development workflows for a media streaming platform with complex third-party integrations, security requirements, and testing patterns.

## Configuration Files

### [`config.json`](config.json) - Core Project Configuration

**Purpose**: Defines project structure, npm command policies, Docker workflows, and testing framework rules.

**Key Sections**:

- **Project Definition**: Media streaming platform with TypeScript/React stack
- **NPM Command Policy**: All commands must execute from root directory
- **Docker Workflow Rules**: No hot reload, E2E verification required
- **HTTP-VCR Testing**: Automated fixture generation and content neutralization
- **Security Standards**: JWT authentication, AES-256 encryption, audit logging

**Critical Rules**:

```bash
# ✅ Always execute from root
npm run test:backend:e2e

# ❌ Never navigate to workspaces
cd backend && npm test
```

### [`modes.json`](modes.json) - Specialized Development Modes

**Purpose**: Custom modes for different development tasks with specific capabilities and file access patterns.

#### Available Modes

| Mode                        | Icon | Purpose                      | Key Capabilities                                                  |
| --------------------------- | ---- | ---------------------------- | ----------------------------------------------------------------- |
| **third-party-integration** | 🔌   | External API integration     | HTTP-VCR workflow, fixture analysis, content neutralization       |
| **media-streaming**         | 🎬   | Content directory & torrents | Streaming optimization, metadata extraction, quality assessment   |
| **security-audit**          | 🛡️   | Security compliance          | Authentication review, encryption audit, vulnerability assessment |
| **docker-e2e**              | 🐳   | Container testing workflows  | Docker lifecycle, E2E orchestration, service integration          |

#### Mode Relationships

- **Integration ↔ Security**: API integrations require security review
- **Streaming → Docker**: Content features need E2E validation
- **Security → All**: Security validates all implementations
- **Docker ← All**: E2E tests validate all integrations

### [`workflows.json`](workflows.json) - Automated Process Orchestration

**Purpose**: Defines step-by-step automated workflows for complex development tasks.

#### Primary Workflows

**Third-Party API Integration** (8 steps):

1. API Analysis → 2. Types & Client → 3. Initial Tests → 4. Fixture Generation
2. Fixture Analysis → 6. Transformer Creation → 7. Neutralization → 8. E2E Testing

**E2E Testing Lifecycle** (5 steps):

1. Environment Prep → 2. Service Startup → 3. Test Execution → 4. Result Analysis → 5. Cleanup

**Security Compliance Audit** (6 steps):

1. Auth Audit → 2. Encryption Audit → 3. Rate Limiting → 4. Audit Logging → 5. Vulnerability Assessment → 6. Compliance Validation

### [`integrations.json`](integrations.json) - Integration Patterns & Dependencies

**Purpose**: Defines integration patterns, dependencies, and configuration for all system components.

#### Integration Patterns

**HTTP-VCR Testing**:

- Fixtures: [`backend/test-fixtures/`](../backend/test-fixtures/), [`backend-e2e/docker/`](../backend-e2e/docker/)
- Transformers: [`backend/src/__test-utils__/http-vcr-utils/`](../backend/src/__test-utils__/http-vcr-utils/)
- Global config: [`backend/src/__test-utils__/http-vcr.config.ts`](../backend/src/__test-utils__/http-vcr.config.ts)

**External APIs**:

- **YTS**: Movie torrents with title/hash neutralization
- **TheRARBG**: TV/movie torrents with tracker anonymization
- **TMDB**: Metadata with plot/image placeholder replacement
- **Trakt**: User data with privacy anonymization

**Security Middleware Stack**:

1. Rate Limiting → 2. Authentication → 3. Audit Logging

## Quick Reference

### Essential Commands

```bash
# Development
npm run dev                    # Start development servers
npm run test:backend          # Unit tests
npm run check:ts             # TypeScript check

# E2E Testing
npm run start:backend:e2e    # Start E2E environment
npm run test:backend:e2e     # Full E2E cycle
npm run test:backend:e2e:dev # Test against running env
npm run docker:cleanup       # Clean Docker resources

# Quality
npm run lint:fix            # Fix linting
npm run build              # Build project
```

### File Structure Patterns

#### Content Directory Integration

```
backend/src/content-directories/{service}/
├── index.ts                 # Main export
├── {service}.api.ts        # API client
├── {service}.types.ts      # TypeScript definitions
├── {service}.utils.ts      # Helper utilities
└── {service}.api.test.ts   # HTTP-VCR tests
```

#### Test Fixtures Organization

```
backend/test-fixtures/{service}/
├── endpoint-name/
│   ├── request-params.json
│   └── response.json
└── transformed/             # Neutralized data
    └── endpoint-name.json
```

#### Security Middleware Files

```
backend/src/middleware/
├── auth.middleware.ts       # JWT authentication
├── audit-log.middleware.ts  # Request auditing
└── rate-limit.middleware.ts # Rate limiting
```

## Integration Examples

### Adding New External API

1. **Create file structure** following content directory pattern
2. **Implement API client** extending [`ContentDirectoryAbstract`](../backend/src/content-directories/content-directory.abstract.ts)
3. **Write HTTP-VCR tests** with real API calls
4. **Generate fixtures** via test execution
5. **Create transformers** for content neutralization
6. **Update HTTP-VCR config** in [`http-vcr.config.ts`](../backend/src/__test-utils__/http-vcr.config.ts)
7. **Run E2E validation** with [`npm run test:backend:e2e`](../package.json)

### Data Neutralization Strategy

```typescript
// Transform copyrighted content while preserving structure
export class ServiceTransformer {
  static transformResponse(response: any): any {
    return {
      ...response,
      movies: response.movies?.map(movie => ({
        ...movie,
        title: generateNeutralTitle(), // ✅ Neutral
        year: movie.year, // ✅ Preserve
        genre: movie.genre, // ✅ Preserve
        description: generateNeutralPlot(), // ✅ Neutral
        poster_url: generatePlaceholderUrl(), // ✅ Neutral
      })),
    };
  }
}
```

### Security Compliance Checklist

- [ ] **Authentication**: JWT with refresh token rotation
- [ ] **Authorization**: Role-based access control
- [ ] **Encryption**: AES-256-GCM for sensitive data
- [ ] **Rate Limiting**: Sliding window implementation
- [ ] **Audit Logging**: Comprehensive request tracking
- [ ] **Data Protection**: GDPR compliance for user data
- [ ] **API Security**: Input validation and sanitization

## Best Practices

### Development Workflow

1. **Always use Docker** for development and testing
2. **Execute npm from root** - never navigate to workspaces
3. **Verify via E2E tests** - no hot reload available
4. **Use specialized modes** for focused development
5. **Clean Docker resources** regularly with cleanup command

### Testing Strategy

1. **Unit tests first** for immediate feedback
2. **HTTP-VCR for APIs** with content neutralization
3. **E2E for integration** validation via Docker
4. **Security audits** for compliance verification

### Content Integration

1. **Abstract base extension** for new content directories
2. **Rate limiting implementation** for all external APIs
3. **Comprehensive fixtures** with neutralized test data
4. **Background processing** for streaming optimization

### Security Implementation

1. **JWT with refresh tokens** for stateless authentication
2. **Comprehensive audit logging** for compliance tracking
3. **Rate limiting enforcement** on all public endpoints
4. **Content neutralization** for copyrighted material

## Troubleshooting

### Common Issues

**Docker Problems**:

```bash
# Clean and restart
npm run docker:cleanup
npm run start:backend:e2e
```

**HTTP-VCR Issues**:

```bash
# Delete problematic fixtures
rm -rf backend/test-fixtures/{service}/
# Regenerate with real API calls
npm run test:backend -- {service}.api.test.ts
```

**TypeScript Errors**:

```bash
# Check compilation
npm run check:ts
# Fix linting
npm run lint:fix
```

### Configuration Validation

- **TypeScript**: [`npm run check:ts`](../package.json)
- **Linting**: [`npm run lint:fix`](../package.json)
- **Docker Health**: Service health check endpoints
- **Security**: Use security-audit mode for compliance

## Related Documentation

- [Complete Configuration Guide](../docs/roo-configuration.md) - Comprehensive configuration documentation
- [Workflow Guide](../docs/workflow-guide.md) - Step-by-step development procedures
- [Testing Infrastructure](../docs/testing-infrastructure.md) - Testing patterns and practices
- [Security Architecture](../docs/architecture-diagrams/05-security-architecture.md) - Security implementation details

This configuration enables efficient, secure, and compliant development of the miauflix media streaming platform while maintaining proper workflow automation and compliance requirements.
