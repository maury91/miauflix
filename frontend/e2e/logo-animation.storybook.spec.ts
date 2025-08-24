import { test } from './fixtures';
import { createCompositeScreenshot } from './utils/composite-grid';
import { buildStorybookUrl } from './utils/storybook-url';

const PROGRESS_BAR_STYLES = `
.progress {
  width: 100%;
  height: 100%;
  background: #1a1a1a;
  display: flex;
  align-items: center;
  padding: 0 8px;
  box-sizing: border-box;
}
.progress-bar {
  height: 8px;
  background: #333;
  margin-right: 8px;
  flex: 1;
  border-radius: 2px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: #db202c;
  border-radius: 2px;
  transition: none;
}
.progress-text {
  color: #999;
  font-size: 10px;
  font-family: 'DejaVu Sans Mono';
  font-variant-ligatures: none;
  font-smooth: never;
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: auto;
  width: 30px;
  text-align: center;
  flex-shrink: 0;
}
`;

/**
 * Screenshot tests for logo animation at various progress points
 * Tests the IntroAnimation component through Storybook stories
 */
test.describe('Logo Animation - Storybook Visual Tests', () => {
  const STORYBOOK_BASE_URL = 'http://localhost:6006/iframe.html';

  test.beforeEach(async ({ page }) => {
    // Set consistent viewport for screenshot comparisons
    await page.setViewportSize({ width: 1920, height: 1080 });

    // Disable animations initially for controlled testing
    await page.addInitScript(() => {
      // Disable CSS transitions and animations for stability
      const style = document.createElement('style');
      style.textContent = `
        *, *::before, *::after {
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          transition-duration: 0s !important;
          transition-delay: 0s !important;
        }
      `;
      document.head.appendChild(style);

      // Force stable rendering by disabling hardware acceleration variations
      const renderStyle = document.createElement('style');
      renderStyle.textContent = `
        * {
          -webkit-transform-style: flat !important;
          transform-style: flat !important;
          -webkit-backface-visibility: visible !important;
          backface-visibility: visible !important;
          will-change: auto !important;
        }
      `;
      document.head.appendChild(renderStyle);
    });
  });

  [true, false].forEach(lowResourceAnimation => {
    test(`should capture keypoints of the animation ${lowResourceAnimation ? '[low resource mode]' : ''}`, async ({
      page,
    }) => {
      // Perfect 4x4 grid with 16 keypoints
      const testPoints = [
        0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0,
      ];
      const frameWidth = 300;
      const frameHeight = 225;
      const footerHeight = 20;

      await createCompositeScreenshot({
        page,
        frames: testPoints,
        frameWidth,
        frameHeight,
        footerHeight,
        cols: 4,
        backgroundColor: '#000',
        screenshotName: `logo-animation-composite-4x4${lowResourceAnimation ? '-low-resource' : ''}.png`,
        styles: PROGRESS_BAR_STYLES,
        async prepare() {
          const args = {
            seekPosition: testPoints[0],
            showInfo: false,
            backgroundImage: true,
            lowResourceAnimation: lowResourceAnimation,
          };

          const url = buildStorybookUrl(
            STORYBOOK_BASE_URL,
            'animations-intro-animation--interactive-controls',
            args
          );

          await page.goto(url);
          await page.waitForLoadState('networkidle');
        },
        async render(point) {
          const percentage = Math.round(point * 100);

          await page.evaluate((seekTo: number) => {
            // @ts-expect-error - this is a custom property for testing
            window.seek(seekTo);
          }, point);

          // Wait for animation to be ready and stable
          await page.waitForTimeout(200);

          return `
            <div class="progress">
              <div class="progress-text">${percentage}%</div>
              <div class="progress-bar">
                <div class="progress-fill" style="width: ${percentage}%"></div>
              </div>
            </div>
          `;
        },
      });
    });
  });
});
