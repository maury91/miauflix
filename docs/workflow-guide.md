# Workflow Guide for miauflix-bun

This guide provides practical, step-by-step workflows for common development tasks in the miauflix-bun project. It focuses on actionable procedures and real-world scenarios developers will encounter.

## Prerequisites

Before starting any workflow, ensure you have:

- **Docker** and **Docker Compose** installed and running
- **Node.js** and **npm** installed for package management
- Access to the project repository with proper permissions
- Understanding of the [Roo Configuration](roo-configuration.md) fundamentals

## Core Development Workflows

### 1. Setting Up Development Environment

#### Initial Setup

```bash
# Clone and setup
git clone <repository-url>
cd miauflix-bun

# Install dependencies (always from root)
npm install

# Verify TypeScript compilation
npm run check:ts

# Fix any linting issues
npm run lint:fix
```

#### Environment Verification

```bash
# Start the E2E environment to verify Docker setup
npm run start:backend:e2e

# In another terminal, run development tests
npm run test:backend:e2e:dev

# Clean up when done
npm run docker:cleanup
```

### 2. Daily Development Workflow

#### Making Code Changes

Since the project doesn't support hot reload, follow this pattern:

```bash
# 1. Make your code changes
# 2. Run unit tests for immediate feedback
npm run test:backend

# 3. Check TypeScript compilation
npm run check:ts

# 4. For integration verification, run E2E tests
npm run test:backend:e2e

# 5. Clean up Docker resources
npm run docker:cleanup
```

#### Before Committing

```bash
# Run complete test suite
npm run test:backend
npm run test:backend:e2e

# Fix linting and formatting
npm run lint:fix

# Verify build
npm run build
```

## Third-Party API Integration

This is the most complex workflow in the project. Follow these steps to integrate a new external API.

### Step 1: API Analysis and Planning

1. **Review API Documentation**

   - Rate limits and authentication requirements
   - Data structure and response formats
   - Available endpoints and parameters

2. **Plan Integration Scope**
   - Determine which endpoints to integrate
   - Identify copyrighted content requiring neutralization
   - Plan data transformation strategies

### Step 2: Create API Client Structure

Create the standard file structure for the new service:

```bash
# Example for a service called "newservice"
mkdir -p backend/src/content-directories/newservice

# Create required files
touch backend/src/content-directories/newservice/index.ts
touch backend/src/content-directories/newservice/newservice.api.ts
touch backend/src/content-directories/newservice/newservice.types.ts
touch backend/src/content-directories/newservice/newservice.utils.ts
touch backend/src/content-directories/newservice/newservice.api.test.ts
```

### Step 3: Implement Types and API Client

#### Create Type Definitions

In [`newservice.types.ts`](backend/src/content-directories/):

```typescript
// Define API response interfaces
export interface NewServiceResponse {
  // Map actual API response structure
}

export interface NewServiceConfig {
  baseUrl: string;
  apiKey?: string;
  rateLimit: number;
}
```

#### Implement API Client

In [`newservice.api.ts`](backend/src/content-directories/):

```typescript
import { ContentDirectoryAbstract } from '../content-directory.abstract';
import { NewServiceResponse, NewServiceConfig } from './newservice.types';

export class NewServiceAPI extends ContentDirectoryAbstract {
  constructor(private config: NewServiceConfig) {
    super();
  }

  async searchContent(query: string): Promise<NewServiceResponse> {
    // Implement API calls with rate limiting
    // Use shared utilities from utils/api.util.ts
  }
}
```

### Step 4: Write Initial Tests with Real API Calls

In [`newservice.api.test.ts`](backend/src/content-directories/):

```typescript
import { NewServiceAPI } from './newservice.api';

describe('NewServiceAPI', () => {
  it('should fetch content from real API', async () => {
    // This test will make real API calls initially
    // HTTP-VCR will record these for future playback
    const api = new NewServiceAPI({
      baseUrl: 'https://api.newservice.com',
      rateLimit: 100,
    });

    const result = await api.searchContent('test query');

    expect(result).toBeDefined();
    // Add comprehensive assertions
  });
});
```

### Step 5: Generate HTTP Fixtures

```bash
# Run the test to generate fixtures (will make real API calls)
npm run test:backend -- newservice.api.test.ts

# Fixtures will be saved to backend/test-fixtures/newservice/
```

### Step 6: Analyze Fixtures and Plan Neutralization

1. **Examine Generated Fixtures**

   ```bash
   ls backend/test-fixtures/newservice/
   # Review JSON files to understand data structure
   ```

2. **Identify Copyrighted Content**

   - Movie/TV show titles
   - Plot descriptions
   - Poster/image URLs
   - Any copyrighted metadata

3. **Plan Transformation Rules**
   - Title replacements
   - Description sanitization
   - URL placeholder strategies
   - Hash generation patterns

### Step 7: Create Data Transformers

Create [`backend/src/__test-utils__/http-vcr-utils/newservice.transformer.ts`](backend/src/__test-utils__/http-vcr-utils/):

```typescript
export class NewServiceTransformer {
  static transformResponse(response: any): any {
    return {
      ...response,
      movies: response.movies?.map(movie => ({
        ...movie,
        title: this.generateNeutralTitle(),
        description: this.generateNeutralDescription(movie.description?.length),
        poster_url: this.generatePlaceholderUrl(movie.poster_url),
        // Preserve important structural data
        year: movie.year,
        genre: movie.genre,
        rating: movie.rating,
      })),
    };
  }

  private static generateNeutralTitle(): string {
    // Generate neutral, English-sounding movie titles
    const adjectives = ['Amazing', 'Great', 'Fantastic', 'Incredible'];
    const nouns = ['Adventure', 'Journey', 'Story', 'Tale'];
    return `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${nouns[Math.floor(Math.random() * nouns.length)]}`;
  }

  private static generateNeutralDescription(originalLength?: number): string {
    // Generate neutral description preserving original length
    const baseDescription = 'A compelling story about characters on an interesting journey.';
    return originalLength ? baseDescription.padEnd(originalLength, ' ') : baseDescription;
  }

  private static generatePlaceholderUrl(originalUrl?: string): string {
    // Extract dimensions if possible and use placeholder service
    return 'https://via.placeholder.com/300x450/cccccc/969696?text=Movie+Poster';
  }
}
```

### Step 8: Integrate Transformers into HTTP-VCR Configuration

Update [`backend/src/__test-utils__/http-vcr.config.ts`](backend/src/__test-utils__/http-vcr.config.ts) to include your new service:

```typescript
import { NewServiceTransformer } from './http-vcr-utils/newservice.transformer';

export const HTTP_VCR_CONFIG: HttpVcrConfig = {
  // ... existing config
  providerMap: [
    // ... existing providers
    { pattern: 'api.newservice.com', name: 'newservice' },
  ],
  transformers: [
    // ... existing transformers
    {
      urlPattern: 'api\\.newservice\\.com\\/.*',
      transform: NewServiceTransformer.transformResponse,
    },
  ],
  // ... rest of config
};
```

HTTP-VCR is automatically configured globally, so your tests will automatically use the transformers:

```typescript
describe('NewServiceAPI with VCR', () => {
  it('should work with transformed fixtures', async () => {
    // HTTP-VCR automatically intercepts and transforms API calls
    // based on the global configuration
    const api = new NewServiceAPI(config);
    const result = await api.searchContent('test');

    // Test will use transformed fixtures automatically
    expect(result).toBeDefined();
  });
});
```

### Step 9: Integration and E2E Testing

```bash
# Run unit tests with fixtures
npm run test:backend -- newservice

# Run full integration tests
npm run test:backend:e2e

# Verify in development environment
npm run start:backend:e2e
npm run test:backend:e2e:dev
```

## E2E Testing Procedures

### Full E2E Test Cycle

The E2E testing workflow manages the complete Docker lifecycle:

```bash
# 1. Full cycle (starts, tests, cleans up automatically)
npm run test:backend:e2e

# This command:
# - Validates Docker compose files
# - Starts all services
# - Waits for service health
# - Runs integration tests
# - Collects results
# - Cleans up containers
```

### Development E2E Testing

For iterative development against a running environment:

```bash
# 1. Start the E2E environment (keeps running)
npm run start:backend:e2e

# 2. In another terminal, run tests against running environment
npm run test:backend:e2e:dev

# 3. Make changes and re-run tests as needed
npm run test:backend:e2e:dev

# 4. When done, clean up
npm run docker:cleanup
```

### E2E Testing Best Practices

1. **Always Clean Up**

   ```bash
   # Before starting new tests
   npm run docker:cleanup
   ```

2. **Monitor Resource Usage**

   ```bash
   # Check running containers
   docker ps

   # Check resource usage
   docker stats
   ```

3. **Verify Service Health**
   ```bash
   # After starting E2E environment, verify services
   curl http://localhost:3000/health
   ```

## Security Audit and Compliance Workflows

### Authentication Security Review

1. **JWT Implementation Audit**

   ```bash
   # Review JWT middleware
   # Check: backend/src/middleware/auth.middleware.ts
   # Verify: Token expiration, secret strength, refresh rotation
   ```

2. **Refresh Token Security**

   ```bash
   # Review refresh token entity
   # Check: backend/src/entities/refresh-token.entity.ts
   # Verify: Rotation policy, secure storage, expiration
   ```

3. **Session Management**

   ```bash
   # Test authentication flows
   npm run test:backend -- auth

   # Run E2E auth tests
   npm run test:backend:e2e -- auth
   ```

### Encryption and Data Protection

1. **Encryption Algorithm Verification**

   - Verify AES-256-GCM usage
   - Check key management practices
   - Validate IV/salt generation

2. **Data at Rest Protection**

   ```bash
   # Review chunk store encryption
   # Check: backend/src/chunk-stores/encrypted-chunk-store/
   ```

3. **Transmission Security**
   - HTTPS enforcement
   - Certificate management
   - Secure headers implementation

### Rate Limiting and DoS Protection

1. **Rate Limit Configuration Review**

   ```bash
   # Review rate limiting middleware
   # Check: backend/src/middleware/rate-limit.middleware.ts
   ```

2. **Rate Limit Testing**
   ```bash
   # Test rate limit enforcement
   npm run test:backend -- rate-limit
   ```

### Audit Logging Compliance

1. **Audit Log Implementation**

   ```bash
   # Review audit middleware
   # Check: backend/src/middleware/audit-log.middleware.ts
   # Check: backend/src/entities/audit-log.entity.ts
   ```

2. **Compliance Verification**
   - Authentication events logging
   - Authorization failure tracking
   - Data access auditing
   - Configuration change monitoring

## Troubleshooting Common Issues

### Docker-Related Issues

**Container Startup Failures**

```bash
# Check container logs
docker-compose logs backend
docker-compose logs database

# Verify Docker resources
docker system df
docker system prune  # If needed

# Clean restart
npm run docker:cleanup
npm run start:backend:e2e
```

**Port Conflicts**

```bash
# Check for port conflicts
lsof -i :3000
lsof -i :5432

# Kill conflicting processes if necessary
```

**Volume Permission Issues**

```bash
# Fix volume permissions
sudo chown -R $USER:$USER data/
```

### Testing Issues

**HTTP-VCR Fixture Problems**

```bash
# Delete corrupted fixtures
rm -rf backend/test-fixtures/problematic-service/

# Regenerate fixtures
npm run test:backend -- problematic-service.api.test.ts
```

**E2E Test Failures**

```bash
# Check service health
curl http://localhost:3000/health

# Review container logs
docker-compose logs --tail=50

# Restart environment
npm run docker:cleanup
npm run start:backend:e2e
```

**Missing Environment Variables**

```bash
# Check environment file
cat .env.development

# Verify required variables are set
echo $TMDB_API_KEY
echo $POSTGRES_PASSWORD
```

### Performance Issues

**Slow Test Execution**

```bash
# Run specific test suites
npm run test:backend -- --testPathPattern=specific-test

# Check Docker resource allocation
docker stats
```

**Memory Issues**

```bash
# Check memory usage
docker stats

# Clean up unused containers/images
docker system prune -a
```

**API Rate Limiting**

```bash
# Check rate limit implementation
# Review: backend/src/utils/api.util.ts
# Implement exponential backoff if needed
```

### Development Workflow Issues

**TypeScript Compilation Errors**

```bash
# Check for type errors
npm run check:ts

# Review tsconfig.json settings
# Check path mappings in tsconfig.json
```

**Linting Issues**

```bash
# Auto-fix linting issues
npm run lint:fix

# Review .eslintrc configuration if persistent issues
```

## Quick Reference Commands

### Essential Commands

```bash
# Development
npm run dev                    # Start development servers
npm run test:backend          # Unit tests
npm run check:ts             # TypeScript compilation

# E2E Testing
npm run start:backend:e2e    # Start E2E environment
npm run test:backend:e2e     # Full E2E cycle
npm run test:backend:e2e:dev # Test against running environment
npm run docker:cleanup       # Clean Docker resources

# Quality Assurance
npm run lint:fix            # Fix linting issues
npm run build              # Build project
```

### Docker Management

```bash
# Container Management
docker ps                           # List running containers
docker-compose logs <service>       # View service logs
docker-compose restart <service>    # Restart specific service

# Resource Management
docker system df                    # Check Docker space usage
docker system prune                 # Clean unused resources
docker volume ls                    # List volumes
docker network ls                   # List networks
```

### Debugging Commands

```bash
# Service Health Checks
curl http://localhost:3000/health   # Backend health
curl http://localhost:3000/api/v1/  # API availability

# Database Connection
docker exec -it miauflix-postgres psql -U postgres -d miauflix

# Container Shell Access
docker exec -it miauflix-backend /bin/bash
```

This workflow guide provides the practical foundation for efficient development in the miauflix-bun project while maintaining compliance with security and testing requirements.
