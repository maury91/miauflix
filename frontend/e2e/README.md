# E2E Testing System with Stable Text Rendering

This directory contains End-to-End tests for the Miauflix frontend application using Playwright, focusing on visual testing and animation behavior verification across all environments, particularly CI/GitHub Actions.

## Current Implementation

### Test Files

Tests consist of two main types:

- **Integrated Tests**: Tests the entire frontend application, including the backend integration.
- **Visual Tests**: Tests the visual components of the frontend application in isolation.

Structure:

- `*.integrated.spec.ts` - Integrated tests
- `*.storybook.spec.ts` - Visual tests
- `*-snapshots/` - Reference screenshots for visual comparisons

### Core Features

#### Full Stack E2E Integration Testing ( \*.integrated.spec.ts )

- Tests complete frontend-backend integration using Docker environment
- Responsive layout testing (desktop, tablet, mobile)
- Screenshot capture for visual validation
- Real backend is executed with mocked external services

#### Storybook Integration Testing ( \*.storybook.spec.ts )

- Tests the visual components of the frontend application in isolation.
- Precise screenshot comparison using Playwright's built-in capabilities
- Consistent viewport sizing (1920x1080) for reliable comparisons
- Configurable thresholds for visual differences
- Automated baseline update capabilities

## Available Test Commands

Based on the actual package.json scripts:

```bash
# Main E2E tests with full backend integration (default)
npm run test:e2e

# E2E tests with UI interface
npm run test:e2e:ui

# E2E tests with browser visible
npm run test:e2e:headed

# E2E tests with debugging capabilities
npm run test:e2e:debug

# Visual tests (Storybook-based)
npm run test:visual

# Update visual test screenshots/baselines
npm run test:visual:update

# Visual tests with debugging
npm run test:visual:debug
```

## 🎯 Stable Text Rendering Features

### Font Consistency Across Environments

- **Robust Font Stacks**: Comprehensive font fallbacks work across all platforms
- **Font Loading Detection**: Waits for `document.fonts.ready` before screenshots
- **Docker-based Testing**: Uses containerized environment for absolute consistency
- **Standardized Browser Rendering**: Configured with consistent font rendering options

### CI Testing with Docker

GitHub Actions automatically uses Docker for consistent font rendering:

```bash
# CI runs tests in official Playwright Docker image
# with standardized font stack and rendering options
```

## Test Structure

### Visual Animation Testing Process

1. **Setup**: Disables CSS animations for controlled testing
2. **Capture**: Takes screenshots at N keyframe points (0-100% progress)
3. **Composite**: Creates a NxM grid showing animation progression
4. **Compare**: Uses Playwright's visual comparison with configurable thresholds

### Browser Support

The Playwright configuration includes:

- **Desktop browsers**: Chromium, Firefox, WebKit
- **Mobile testing**: Chrome (Pixel 5), Safari (iPhone 12)
- **Storybook-optimized**: Special Chromium project with animation-friendly flags
- **High-DPI support**: Available for detailed visual testing

### Test Environment

#### Main E2E Tests (test:e2e)

- **Backend-E2E environment**: Full Docker environment at `http://localhost:3000`
- **Integrated testing**: Frontend served by backend with complete API mocking

#### Visual Tests (test:visual)

- **Frontend server**: Expected at `http://localhost:4174`
- **Storybook server**: Expected at `http://localhost:6006`

## Configuration

### Playwright Settings

Key configurations in `playwright.config.ts`:

- Test timeout: 60 seconds
- Action timeout: 15 seconds
- Navigation timeout: 30 seconds
- Video recording on failure
- Screenshot on failure
- Trace collection on retry
