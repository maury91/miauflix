/// <reference types="vitest/config" />
/// <reference types='vitest' />
// import { AssetGlob } from '@nx/js/src/utils/assets/assets';
import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import path from 'path';
// Phase 0 Bootstrap: Comment out NX-specific imports for now
// TODO: Re-enable in future phases when NX workspace is properly configured
// import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
// import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
// import { injectScripts, publicTypescript } from 'vite-plugin-public-typescript';
import Icons from 'unplugin-icons/vite';
import { defineConfig } from 'vite';
import webfontDownload from 'vite-plugin-webfont-dl';

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon

const tizenBuild = process.env['VITE_TIZEN'] === 'true';
if (tizenBuild) {
  console.log('executing tizen build');
}

// Phase 0 Bootstrap: Comment out complex asset and plugin configurations
// TODO: Re-enable in future phases
// const assets: (string | AssetGlob)[] = tizenBuild
//   ? [
//       {
//         input: '../../tizen/',
//         output: './',
//         glob: 'config.xml',
//       },
//     ]
//   : [];

// const tizenPlugins = [
//   publicTypescript({
//     inputDir: 'src/startup',
//   }),
//   injectScripts(manifest => [
//     {
//       attrs: {
//         // The file name in the directory, for example, test.ts --> manifest.test
//         src: manifest.tizen,
//       },
//       injectTo: 'body',
//     },
//   ]),
// ];

export default defineConfig({
  root: __dirname,
  cacheDir: '../node_modules/.vite/frontend',
  server: {
    port: 4173,
    host: 'localhost',
    proxy: {
      '/api': {
        target: process.env.BACKEND_URL || 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
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
              target: process.env.API_URL || 'http://localhost:3000',
              changeOrigin: true,
              secure: false,
            },
          }
        : undefined,
  },
  define: {
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
          // Only run during build (not dev)
          if (context.bundle) {
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
    // ...(tizenBuild ? tizenPlugins : []),
    basicSsl({
      /** name of certification */
      name: 'miauflix-vite',
    }),
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
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    rollupOptions: {
      input: path.resolve(__dirname, 'index.html'), // Use HTML as entry point to trigger transformIndexHtml
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
