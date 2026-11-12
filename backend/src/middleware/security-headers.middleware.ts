import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { logger } from '@logger';
import { secureHeaders } from 'hono/secure-headers';

/** `'sha256-…'` sources for the inline `<script>` blocks of the served `index.html`. */
export function inlineScriptHashes(html: string): string[] {
  const hashes: string[] = [];
  for (const [, attributes, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
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

/**
 * Security headers for every response. The CSP is written for the web app this server serves
 * from `frontendDir`: its scripts, the inline `window.API_URL` script (by hash), styled-components'
 * `<style>` tags, the WebAssembly subtitle renderer and its workers, TMDB images, and blob media.
 * It is what limits an XSS to the page's own origin. HSTS is left to the TLS terminator (Caddy).
 * Cross-origin resource policy stays open: the TV app loads streams and images from its local
 * `file://` page.
 */
export function createSecurityHeadersMiddleware(frontendDir: string | undefined) {
  const scriptHashes = readInlineScriptHashes(frontendDir);

  return secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'wasm-unsafe-eval'", ...scriptHashes],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https://image.tmdb.org'],
      fontSrc: ["'self'", 'data:'],
      mediaSrc: ["'self'", 'blob:', 'data:'],
      connectSrc: ["'self'", 'https://image.tmdb.org'],
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
