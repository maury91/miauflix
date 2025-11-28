/**
 * Shared constants for E2E testing configuration
 */

/**
 * Chrome DevTools Protocol (CDP) port mapping for Playwright projects.
 * These ports must match the remote-debugging-port args in playwright.config.e2e.ts
 */
export const CDP_PORT_MAP: Record<string, number> = {
  'chromium-desktop': 9222,
  'Mobile Chrome': 9223,
  'high-dpi': 9224,
};

/**
 * Default CDP port fallback
 */
export const DEFAULT_CDP_PORT = 9222;
