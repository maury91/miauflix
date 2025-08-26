# E2E Testing System with Stable Text Rendering

This directory contains End-to-End tests for the Miauflix frontend application using Playwright, focusing on visual testing and animation behavior verification with **stable text rendering** across all environments, particularly CI/GitHub Actions.

## Current Implementation

### Test Files

- `login-page.integrated.spec.ts` - **Main E2E tests** with full backend integration
- `logo-animation.storybook.spec.ts` - Visual regression tests for logo animation via Storybook
- `global-setup.integrated.ts` - Global setup for backend-e2e integration tests
- `global-setup.ts` - Global test setup for standalone frontend tests
- `logo-animation.storybook.spec.ts-snapshots/` - Reference screenshots for visual comparisons

### Core Features

#### Full Stack E2E Integration Testing

- Tests complete frontend-backend integration using Docker environment
- Real login page testing with animation timing fixes
- Responsive layout testing (desktop, tablet, mobile)
- Screenshot capture for visual validation
- Backend API mocking through backend-e2e environment

#### Storybook Integration Testing

- Tests the `IntroAnimation` component through Storybook iframe
- Captures animation keyframes at specific progress points (0%, 5%, 10%, 15%, etc.)
- Creates composite 4x4 grid screenshots showing animation progression
- Supports both normal and low-resource animation modes

#### Visual Regression Testing

- Precise screenshot comparison using Playwright's built-in capabilities
- Consistent viewport sizing (1920x1080) for reliable comparisons
- Configurable thresholds for visual differences
- Automated baseline update capabilities

#### Performance Monitoring Setup

- Global performance observer utilities
- Frontend server pre-warming
- Backend connectivity validation (expects mock server at :3001)

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

# Visual tests (Storybook-based, includes logo animation)
npm run test:visual

# 🐳 Visual tests with Docker for maximum CI consistency (optional)
npm run test:visual:docker

# Update visual test screenshots/baselines
npm run test:visual:update

# Visual tests with UI interface
npm run test:visual:ui

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
2. **Capture**: Takes screenshots at 16 keyframe points (0-100% progress)
3. **Composite**: Creates a 4x4 grid showing animation progression
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

### Visual Testing Parameters

- **Threshold**: 0.1 (10% pixel difference tolerance)
- **Max diff pixels**: 200 pixels difference allowed
- **Screenshot type**: PNG format
- **Full page**: Complete page capture

## Current Test Coverage

### Logo Animation Testing

- ✅ **Keyframe capture** at 16 progress points
- ✅ **Visual regression** comparison with baselines
- ✅ **Low-resource mode** testing variant
- ✅ **Grid composition** showing animation flow
- ✅ **Storybook integration** for isolated component testing

### What's NOT Currently Implemented

- ❌ Precise timing control (GSAP pause/resume)
- ❌ Performance metrics measurement
- ❌ Cross-viewport animation testing
- ❌ Mock backend server
- ❌ Animation state transition verification
- ❌ Custom duration testing

## Usage Examples

### Running Visual Tests

```bash
# Test all visual components
npm run test:visual

# Update screenshots if UI changes
npm run test:visual:update

# Debug visual test failures
npm run test:visual:debug
```

### Understanding Test Results

- Screenshots are saved in `logo-animation.storybook.spec.ts-snapshots/`
- Individual progress frames are captured (e.g., `logo-animation-025-percent-storybook-chromium-linux.png`)
- Composite grids show full animation flow
- Test failures will show visual diffs

## Development Workflow

### Adding New Visual Tests

1. Create new `.spec.ts` file in `/e2e/`
2. Use consistent viewport sizes for reliable comparisons
3. Include proper wait states for component loading
4. **Add font loading detection**: `await page.waitForFunction(() => document.fonts.ready)`
5. **Use proper font stacks**: Include comprehensive fallback fonts
6. Use descriptive screenshot names

### Updating Baselines

When UI changes are intentional:

```bash
# Standard baseline update
npm run test:visual:update

# Standard baseline update (CI uses Docker automatically)
npm run test:visual:update
```

### Debugging Test Failures

```bash
# Run with browser visible
npm run test:visual:headed

# Use debugging interface
npm run test:visual:debug

# Debug locally with improved font rendering
npm run test:visual:debug
```

## 🔧 Troubleshooting Font Rendering Issues

### Common Font-Related Problems

#### Problem: Screenshots differ between local and CI

**Solution**: Tests now use improved font rendering with proper fallback stacks

#### Problem: Tests pass locally but fail in GitHub Actions

**Solution**: CI automatically uses Docker with official Playwright image for consistency

#### Problem: Font loading timing issues

**Solution**: All tests now include font loading detection. For custom tests, add:

```typescript
await page.evaluate(() => document.fonts.ready);
```

#### Problem: Font fallback inconsistencies

**Solution**: Use the standardized font stacks:

```css
/* For monospace text */
font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;

/* For sans-serif text */
font-family:
  -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell',
  'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
```

### Key Improvements Applied

- **Robust Font Stacks**: Uses comprehensive fallback fonts that work across all platforms
- **Font Loading Detection**: All tests wait for `document.fonts.ready` before screenshots
- **Standardized Rendering**: Browser configured with consistent font rendering options
- **CI Docker Integration**: GitHub Actions uses official Playwright Docker image automatically

## Dependencies

### Required Services

- **Vite preview server** (port 4174) - for built application testing
- **Storybook dev server** (port 6006) - for component isolation testing

### Optional Services

- **Backend mock server** (port 3001) - for integration testing scenarios

## Architecture Notes

This testing system provides:

- **Visual regression protection** for UI components
- **Animation behavior verification** through keyframe capture
- **Cross-browser compatibility** testing
- **Isolated component testing** via Storybook integration
- **Automated baseline management** for evolving UI

The focus is on ensuring visual consistency and animation quality across different browsers and scenarios, rather than detailed animation timing control.
