# E2E Testing System

This directory contains End-to-End tests for the Miauflix frontend application using Playwright, focusing on visual testing and animation behavior verification.

## Current Implementation

### Test Files

- `logo-animation.storybook.spec.ts` - Visual regression tests for logo animation via Storybook
- `global-setup.ts` - Global test setup and utilities
- `logo-animation.storybook.spec.ts-snapshots/` - Reference screenshots for visual comparisons

### Core Features

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
# Regular E2E tests (excludes Storybook tests)
npm run test:e2e

# E2E tests with UI interface
npm run test:e2e:ui

# E2E tests with browser visible
npm run test:e2e:headed

# E2E tests with debugging capabilities
npm run test:e2e:debug

# Visual tests (Storybook-based, includes logo animation)
npm run test:visual

# Update visual test screenshots/baselines
npm run test:visual:update

# Visual tests with UI interface
npm run test:visual:ui

# Visual tests with debugging
npm run test:visual:debug
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

- **Frontend server**: Expected at `http://localhost:4174`
- **Storybook server**: Expected at `http://localhost:6006`
- **Backend mock**: Optional at `http://localhost:3001` (for integration tests)

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

1. Create new `.spec.ts` file in `/src/e2e/`
2. Use consistent viewport sizes for reliable comparisons
3. Include proper wait states for component loading
4. Use descriptive screenshot names

### Updating Baselines

When UI changes are intentional:

```bash
npm run test:visual:update
```

### Debugging Test Failures

```bash
# Run with browser visible
npm run test:visual:headed

# Use debugging interface
npm run test:visual:debug
```

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
