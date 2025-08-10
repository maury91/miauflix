import { expect, test } from './fixtures';

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
      const progressBarHeight = 20;

      // Collect all animation frames
      const frames = [];

      await page.setViewportSize({ width: frameWidth, height: frameHeight });
      await page.goto(
        `${STORYBOOK_BASE_URL}?id=animations-intro-animation--interactive-controls&args=seekPosition%3A${testPoints[0]}%3BshowInfo%3Afalse%3BbackgroundImage%3Atrue%3BlowResourceAnimation%3A${lowResourceAnimation ? 'true' : 'false'}&viewMode=story`
      );
      await page.waitForLoadState('networkidle');

      for (let i = 0; i < testPoints.length; i++) {
        const point = testPoints[i];
        const percentage = Math.round(point * 100);

        page.evaluate((seekTo: number) => {
          // @ts-expect-error - this is a custom property for testing
          window.seek(seekTo);
        }, point);

        // Wait for animation to be ready and stable
        await page.waitForTimeout(200);

        const frameBuffer = await page.screenshot({
          type: 'png',
          fullPage: true,
        });
        const frameData = frameBuffer.toString('base64');

        frames.push({
          dataUrl: `data:image/png;base64,${frameData}`,
          percentage: percentage,
        });
      }

      // Create 4x4 grid with progress bars
      const compositeWidth = frameWidth * 4;
      const compositeHeight = (frameHeight + progressBarHeight) * 4;

      const compositeHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { 
            margin: 0; 
            padding: 0; 
            background: #000;
          }
          .grid { 
            display: grid; 
            grid-template-columns: repeat(4, ${frameWidth}px); 
            grid-template-rows: repeat(4, ${frameHeight + progressBarHeight}px);
            width: ${compositeWidth}px;
            height: ${compositeHeight}px;
          }
          .frame {
            position: relative;
          }
          .frame img {
            width: ${frameWidth}px;
            height: ${frameHeight}px;
            display: block;
          }
          .progress {
            width: ${frameWidth}px;
            height: ${progressBarHeight}px;
            background: #1a1a1a;
            position: relative;
            display: flex;
            align-items: center;
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
          }
          .progress-text {
            color: #999;
            font-size: 10px;
            font-family: monospace;
            margin: 0 8px;
            width: 30px;
            display: block;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="grid">
          ${frames
            .map(
              frame => `
            <div class="frame">
              <img src="${frame.dataUrl}" />
              <div class="progress">
                <div class="progress-text">${frame.percentage}%</div>
                <div class="progress-bar">
                  <div class="progress-fill" style="width: ${frame.percentage}%"></div>
                </div>
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      </body>
      </html>
    `;

      await page.setViewportSize({ width: compositeWidth, height: compositeHeight });
      await page.setContent(compositeHtml);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);

      await expect(page).toHaveScreenshot(
        `logo-animation-composite-4x4${lowResourceAnimation ? '-low-resource' : ''}.png`,
        {
          threshold: 0.1,
          maxDiffPixels: 200,
          fullPage: true,
          animations: 'disabled', // Ensure no animations are running during screenshot
        }
      );
    });
  });
});
