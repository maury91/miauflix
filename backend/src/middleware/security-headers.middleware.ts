import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { logger } from '@logger';
import { secureHeaders } from 'hono/secure-headers';

/** `'sha256-…'` sources for the inline `<script>` blocks of the served `index.html`. */
export function inlineScriptHashes(html: string): string[] {
  const hashes: string[] = [];
  for (const [, attributes, body] of html.matchAll(
    /<script\b([^>]*)>([\s\S]*?)<\/script\b[^>]*>/gi
  )) {
    if (/\bsrc\s*=/i.test(attributes)) continue;
    hashes.push(`'sha256-${createHash('sha256').update(body).digest('base64')}'`);
  }
  return hashes;
}

function readInlineScriptHashes(frontendDir: string | undefined): string[] {
  if (!frontendDir) return [];
  try {
    return inlineScriptHashes(readFileSync(join(frontendDir, 'index.html'), 'utf8'));
  } catch (error) {
    logger.warn('SecurityHeaders', 'Could not read index.html for the CSP script hashes', {
      error,
    });
    return [];
  }
}

/** The entries of `values` that are plain origins (`https://host[:port]`); others are dropped. */
export function cspOrigins(values: readonly string[]): string[] {
  const origins: string[] = [];
  for (const value of values.map(entry => entry.trim()).filter(Boolean)) {
    let origin: string | undefined;
    try {
      const url = new URL(value);
      if (url.protocol === 'http:' || url.protocol === 'https:') origin = url.origin;
    } catch {
      // Not a URL
    }
    // Anything but the bare origin (a path, `;`, a quote) could rewrite the policy
    if (origin && value.replace(/\/$/, '') === origin) origins.push(origin);
    else
      logger.warn('SecurityHeaders', `Ignoring CSP image origin that is not an origin: ${value}`);
  }
  return origins;
}

/**
 * Security headers for every response. The CSP is written for the web app this server serves
 * from `frontendDir`: its scripts, the inline `window.API_URL` script (by hash), styled-components'
 * `<style>` tags, the WebAssembly subtitle renderer and its workers, TMDB images, and blob media.
 * It is what limits an XSS to the page's own origin. `imageOrigins` adds artwork hosts besides
 * TMDB's (`CSP_IMAGE_ORIGINS`, such as the E2E image mock). HSTS is left to the TLS terminator (Caddy).
 * Cross-origin resource policy stays open: the TV app loads streams and images from its local
 * `file://` page.
 */
export function createSecurityHeadersMiddleware(
  frontendDir: string | undefined,
  imageOrigins: readonly string[] = []
) {
  const scriptHashes = readInlineScriptHashes(frontendDir);
  const artworkOrigins = ['https://image.tmdb.org', ...cspOrigins(imageOrigins)];

  return secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'wasm-unsafe-eval'", ...scriptHashes],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:', ...artworkOrigins],
      fontSrc: ["'self'", 'data:'],
      mediaSrc: ["'self'", 'blob:', 'data:'],
      connectSrc: ["'self'", ...artworkOrigins],
      workerSrc: ["'self'", 'blob:'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
    crossOriginResourcePolicy: false,
    crossOriginEmbedderPolicy: false,
    strictTransportSecurity: false,
    referrerPolicy: 'same-origin',
    xFrameOptions: 'DENY',
  });
}
