/// <reference types="vitest/config" />
/// <reference types='vitest' />
// import { AssetGlob } from '@nx/js/src/utils/assets/assets';
import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
// Phase 0 Bootstrap: Comment out NX-specific imports for now
// TODO: Re-enable in future phases when NX workspace is properly configured
// import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
// import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
// import { injectScripts, publicTypescript } from 'vite-plugin-public-typescript';
import Icons from 'unplugin-icons/vite';
import type { ProxyOptions } from 'vite';
import { defineConfig } from 'vite';
import webfontDownload from 'vite-plugin-webfont-dl';

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon

const tizenBuild = process.env['VITE_TIZEN'] === 'true';
if (tizenBuild) {
  console.log('executing tizen build');
}

/**
 * Make the built page load from the TV's local files (file://): Tizen 5.5 and older block
 * module scripts from file:// and the absolute <base href="/"> points at the filesystem root,
 * so the bundle is a single classic script with paths relative to index.html.
 */
const tizenHtml = {
  name: 'tizen-html',
  apply: 'build' as const,
  transformIndexHtml: {
    order: 'post' as const,
    handler: (html: string) =>
      html
        .replace(/\s*<base href="\/"\s*\/?>/, '')
        .replace(/<script type="module" crossorigin/g, '<script defer')
        .replace(/(<link rel="stylesheet") crossorigin/g, '$1'),
  },
};

/**
 * Rewrite Set-Cookie headers from the backend proxy to host-only cookies.
 *
 * The browser may reach Vite as either localhost or 127.0.0.1. Retaining the
 * backend's Domain=localhost attribute blocks cookies received through the
 * latter, so remove Domain and let the browser bind the cookie to the host
 * that served the proxied response.
 */
function rewriteSetCookieForDev(cookie: string): string {
  return cookie.replace(/\s*;\s*Domain=[^;]*/gi, '');
}

/** Compose service names that can serve the backend (see docker-compose*.yml). */
const DOCKER_BACKEND_HOSTS = new Set(['backend', 'miauflix', 'vpn']);

function isLocalBackend(url: string): boolean {
  const { hostname } = new URL(url);
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '[::1]' ||
    /^127(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(hostname) ||
    DOCKER_BACKEND_HOSTS.has(hostname)
  );
}

function proxyCookieRewriteConfigure(
  proxy: Parameters<NonNullable<ProxyOptions['configure']>>[0]
): void {
  proxy.on('proxyRes', proxyRes => {
    const setCookie = proxyRes.headers['set-cookie'];
    if (!setCookie) return;
    const list = Array.isArray(setCookie) ? setCookie : [setCookie];
    proxyRes.headers['set-cookie'] = list.map((cookie: string) => rewriteSetCookieForDev(cookie));
  });
  // A remote backend (BACKEND_URL) only accepts its own origin (CORS_ORIGIN), including for the
  // realtime WebSocket, so present requests from this dev/preview server's own pages as coming
  // from it. Any other origin is forwarded unchanged so the backend still rejects cross-site use.
  if (!process.env.BACKEND_URL || isLocalBackend(process.env.BACKEND_URL)) return;
  const backendOrigin = new URL(process.env.BACKEND_URL).origin;
  const rewriteOrigin = (
    proxyReq: { getHeader(name: string): unknown; setHeader(name: string, value: string): void },
    req: { headers: { host?: string } }
  ) => {
    const origin = proxyReq.getHeader('origin');
    if (typeof origin !== 'string' || !req.headers.host) return;
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      return;
    }
    if (originHost === req.headers.host) proxyReq.setHeader('origin', backendOrigin);
  };
  proxy.on('proxyReq', rewriteOrigin);
  proxy.on('proxyReqWs', rewriteOrigin);
}

/** The version shown in the app: the root package.json semver is the source of truth. */
function appVersion(): string {
  const rootPackage = JSON.parse(
    readFileSync(path.resolve(__dirname, '../package.json'), 'utf8')
  ) as { version: string };
  return rootPackage.version;
}

const devBackendUrl = process.env.BACKEND_URL || 'http://localhost:5000';
const previewBackendUrl = process.env.BACKEND_URL || 'http://localhost:5000';
// Local backends use self-signed development certificates; remote ones must present a valid one.
const verifyDevBackendCertificate = !isLocalBackend(devBackendUrl);
const verifyPreviewBackendCertificate = !isLocalBackend(previewBackendUrl);
const devCertificateRootOverride = process.env.MIAUFLIX_DEV_CERT_DIR;
const devCertificateRoot = devCertificateRootOverride
  ? path.resolve(__dirname, '..', devCertificateRootOverride)
  : path.resolve(__dirname, '../.certs');
const devCertificateDir = path.join(devCertificateRoot, 'server');
const devCertificateKeyPath = path.join(devCertificateDir, 'localhost-key.pem');
const devCertificatePath = path.join(devCertificateDir, 'localhost.pem');
const testHttp = process.env['MIAUFLIX_TEST_HTTP'] === 'true';
const trustedDevHttps =
  !testHttp && existsSync(devCertificateKeyPath) && existsSync(devCertificatePath)
    ? {
        key: readFileSync(devCertificateKeyPath),
        cert: readFileSync(devCertificatePath),
      }
    : undefined;

export default defineConfig({
  root: __dirname,
  // The TV loads index.html from its local files, so asset URLs must be relative to it.
  base: tizenBuild ? './' : '/',
  cacheDir: '../node_modules/.vite/frontend',
  server: {
    port: 4173,
    host: 'localhost',
    https: trustedDevHttps,
    proxy: {
      '/api': {
        target: devBackendUrl,
        changeOrigin: true,
        secure: verifyDevBackendCertificate,
        ws: true,
        configure: proxyCookieRewriteConfigure,
      },
    },
  },
  preview: {
    port: 4174,
    host: 'localhost',
    proxy:
      process.env.DISABLE_API_PROXY !== 'true'
        ? {
            '/api': {
              target: previewBackendUrl,
              changeOrigin: true,
              secure: verifyPreviewBackendCertificate,
              ws: true,
              configure: proxyCookieRewriteConfigure,
            },
          }
        : undefined,
  },
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion()),
    // Build-time configuration for access token storage
    __ACCESS_TOKEN_STORAGE_MODE__: JSON.stringify(
      process.env.TOKEN_STORAGE_MODE === 'session' ? 'session' : 'memory'
    ),
  },
  plugins: [
    // Phase 0 Bootstrap: Simplified plugin configuration
    Icons({
      compiler: 'jsx',
      jsx: 'react',
      autoInstall: true,
      scale: 1,
      defaultStyle: '',
      defaultClass: '',
    }),
    react(),
    // SSR plugin that injects server-rendered content after Vite processes HTML
    {
      name: 'ssr-inject',
      transformIndexHtml: {
        order: 'post',
        handler: async (html, context) => {
          // Only run during build (not dev); the Tizen build ships without server-rendered markup
          if (context.bundle && !tizenBuild) {
            try {
              // Import the SSR server module
              const ssrOutDir = path.resolve(__dirname, '../dist/frontend-ssr');
              const serverModulePath = path.resolve(ssrOutDir, 'main-server.js');

              // Check if SSR module exists
              const fs = await import('fs/promises');
              try {
                await fs.access(serverModulePath);
              } catch {
                // SSR module doesn't exist, return original HTML
                return html;
              }

              // Dynamic import the server module
              const serverModule = await import(serverModulePath);
              const { render } = serverModule;

              // Extract asset paths from the Vite-processed HTML
              // NOTE: Using regex for HTML parsing is fragile and may break with complex HTML
              // (e.g., attributes with escaped quotes, multi-line tags). Consider using a proper
              // HTML parser like 'node-html-parser' or 'cheerio' if this becomes problematic.
              const scriptMatches = html.match(/<script[^>]+src="([^"]+)"[^>]*><\/script>/g) || [];
              const linkMatches = html.match(/<link[^>]+href="([^"]+\.css)"[^>]*>/g) || [];

              const jsFiles = scriptMatches
                .map(match => {
                  const srcMatch = match.match(/src="([^"]+)"/);
                  return srcMatch ? srcMatch[1] : '';
                })
                .filter(Boolean);

              const cssFiles = linkMatches
                .map(match => {
                  const hrefMatch = match.match(/href="([^"]+\.css)"/);
                  return hrefMatch ? hrefMatch[1] : '';
                })
                .filter(Boolean);

              // Render the SSR content
              const { appHtml, head } = render([...jsFiles, ...cssFiles]);

              // Inject head content (styled-components styles) before closing head tag
              html = html.replace('</head>', `  ${head}\n  </head>`);

              // Replace the app div content with SSR content and remove Hello! text
              html = html.replace('<div id="app"></div>', `<div id="app">${appHtml}</div>`);

              return html;
            } catch (error) {
              console.warn('SSR injection failed:', error);
              return html;
            }
          }

          return html;
        },
      },
    },
    // TODO: Re-enable in future phases
    webfontDownload(),
    // nxViteTsPaths(),
    // nxCopyAssetsPlugin(assets),
    ...(tizenBuild ? [tizenHtml] : []),
    ...(trustedDevHttps || testHttp
      ? []
      : [
          basicSsl({
            /** name of certification */
            name: 'miauflix-vite',
          }),
        ]),
  ],
  // Uncomment this if you are using workers.
  // worker: {
  //  plugins: [ nxViteTsPaths() ],
  // },

  build: {
    outDir: tizenBuild ? '../dist/frontend-tizen' : '../dist/frontend',
    emptyOutDir: true,
    reportCompressedSize: true,
    target: tizenBuild ? 'es2019' : 'esnext',
    // Tizen loads one classic script, so there are no module chunks to preload.
    modulePreload: tizenBuild ? false : undefined,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    rollupOptions: {
      input: path.resolve(__dirname, 'index.html'), // Use HTML as entry point to trigger transformIndexHtml
      output: tizenBuild ? { format: 'iife', inlineDynamicImports: true } : undefined,
    },
  },
  // Phase 0 Bootstrap: Add comprehensive resolve configuration
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@app': path.resolve(__dirname, './src/app'),
      '@features': path.resolve(__dirname, './src/features'),
      '@pages': path.resolve(__dirname, './src/pages'),
      '@shared': path.resolve(__dirname, './src/shared'),
      '@store': path.resolve(__dirname, './src/store'),
      '@types': path.resolve(__dirname, './src/types'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@/__test-utils__': path.resolve(__dirname, './src/__test-utils__'),
    },
  },
});
