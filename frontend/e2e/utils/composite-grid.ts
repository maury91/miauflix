import type { Page } from '@playwright/test';

export interface CompositeScreenshotOptions<T> {
  page: Page;
  frames: T[];
  frameWidth: number;
  frameHeight: number;
  footerHeight: number;
  cols?: number;
  backgroundColor?: string;
  screenshotName: string;
  styles?: string;
  disableAnimations?: boolean;
  prepare?(): Promise<void>;
  render(frame: T): Promise<string>;
  screenshotOptions?: {
    threshold?: number;
    maxDiffPixels?: number;
    fullPage?: boolean;
    animations?: 'disabled' | 'allow';
  };
}

/**
 * Creates a composite screenshot with custom rendering for each frame
 * @param options Configuration options with custom render function
 */
export async function createCompositeScreenshot<T>(
  options: CompositeScreenshotOptions<T>
): Promise<void> {
  const {
    page,
    frames,
    frameWidth,
    frameHeight,
    footerHeight,
    cols = 3,
    backgroundColor = '#0a0d0f',
    screenshotName,
    styles = '',
    disableAnimations = false,
    prepare,
    render,
    screenshotOptions = {},
  } = options;

  // Collect all frame screenshots and footer HTML
  const frameData: Array<{ dataUrl: string; footerHtml: string }> = [];

  await page.setViewportSize({ width: frameWidth, height: frameHeight });

  // Disable animations if requested
  if (disableAnimations) {
    await page.addInitScript(() => {
      const style = document.createElement('style');
      style.textContent = `
        *, *::before, *::after {
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0s !important;
          transition-delay: 0s !important;
          transform-origin: center !important;
          scroll-behavior: auto !important;
        }
        
        /* Disable CSS animations */
        @keyframes * {
          0%, 100% { animation-play-state: paused !important; }
        }
        
        /* Force static states */
        [data-testid*="spinner"], .spinner, .loading {
          animation: none !important;
          transform: none !important;
        }
      `;
      document.head.appendChild(style);
    });

    // Force reduced motion at browser level
    await page.emulateMedia({ reducedMotion: 'reduce' });
  }

  if (prepare) {
    await prepare();
  }

  for (const frame of frames) {
    // Render the frame using custom render function
    const footerHtml = await render(frame);

    // Force animations to stop before screenshot
    if (disableAnimations) {
      await page.evaluate(() => {
        // Pause all CSS animations and transitions
        const animatedElements = document.querySelectorAll('*');
        animatedElements.forEach(el => {
          const computed = getComputedStyle(el);
          if (computed.animationName && computed.animationName !== 'none') {
            (el as HTMLElement).style.animationPlayState = 'paused';
            (el as HTMLElement).style.animationDelay = '0s';
            (el as HTMLElement).style.animationDuration = '0s';
          }
        });
      });
      await page.waitForTimeout(100);
    }

    // Ensure fonts are still loaded after animation changes
    await page.evaluate(() => document.fonts.ready);
    // Wait for animation to be ready and stable
    await page.waitForTimeout(200);

    // Take screenshot
    const frameBuffer = await page.screenshot({
      type: 'png',
      fullPage: true,
      animations: 'disabled',
    });
    const dataUrl = `data:image/png;base64,${frameBuffer.toString('base64')}`;

    frameData.push({ dataUrl, footerHtml });
  }

  // Create composite grid
  const rows = Math.ceil(frames.length / cols);
  const compositeWidth = frameWidth * cols;
  const compositeHeight = (frameHeight + footerHeight) * rows;

  const compositeHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { 
          margin: 0; 
          padding: 0; 
          background: ${backgroundColor};
          color: white;
          font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
          font-variant-ligatures: none;
          font-feature-settings: 'liga' 0, 'calt' 0;
          font-smooth: never;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          text-rendering: optimizeSpeed;
          font-size: 14px;
          line-height: 1.2;
        }
        .grid { 
          display: grid; 
          grid-template-columns: repeat(${cols}, ${frameWidth}px); 
          grid-template-rows: repeat(${rows}, ${frameHeight + footerHeight}px);
          width: ${compositeWidth}px;
          height: ${compositeHeight}px;
        }
        .frame {
          position: relative;
        }
        .frame .image {
          width: ${frameWidth}px;
          height: ${frameHeight}px;
          background-size: contain;
          background-repeat: no-repeat;
          background-position: center;
          display: block;
        }
        .footer {
          width: ${frameWidth}px;
          height: ${footerHeight}px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #1a1a1a;
          color: #cccccc;
          font-size: 12px;
        }

        /* Custom styles */
        ${styles}
      </style>
    </head>
    <body>
      <div class="grid">
        ${frameData
          .map(
            ({ dataUrl, footerHtml }) => `
          <div class="frame">
            <div class="image" style="background-image: url(${dataUrl})"></div>
            <div class="footer">${footerHtml}</div>
          </div>
        `
          )
          .join('')}
      </div>
    </body>
    </html>
  `;

  // Set up composite screenshot
  await page.setViewportSize({ width: compositeWidth, height: compositeHeight });
  await page.setContent(compositeHtml);
  await page.waitForLoadState('networkidle');
  // Ensure all fonts are loaded before taking final screenshot
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);

  // Take final screenshot
  const defaultScreenshotOptions = {
    threshold: 0.1,
    maxDiffPixels: 200,
    fullPage: false,
    animations: 'disabled' as const,
    ...screenshotOptions,
  };

  const { expect } = await import('@playwright/test');
  await expect(page).toHaveScreenshot(screenshotName, defaultScreenshotOptions);
}
