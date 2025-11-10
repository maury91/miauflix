import { fileURLToPath } from 'node:url';

import path from 'path';
import { defineConfig, loadConfigFromFile, mergeConfig } from 'vite';

const dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(async env => {
  // Load the base config
  const configFile = await loadConfigFromFile(env, path.resolve(dirname, 'vite.config.ts'));
  if (!configFile) {
    throw new Error('Failed to load base config');
  }
  const baseConfig = configFile.config;

  // Convert existing aliases (object or array) into an array of { find, replacement }
  const baseAliases = Array.isArray(baseConfig.resolve?.alias)
    ? baseConfig.resolve.alias
    : Object.entries(baseConfig.resolve?.alias ?? {}).map(([find, replacement]) => ({
        find,
        replacement: replacement as string,
      }));

  const ssrMocks = path.resolve(dirname, 'src/app/bootstrap/ssr-mocks.ts');

  return mergeConfig(baseConfig, {
    resolve: {
      alias: [
        ...baseAliases,
        // Replace problematic imports with SSR-safe mocks
        {
          find: /^gsap$/,
          replacement: ssrMocks,
        },
        {
          find: /^gsap\/.*/,
          replacement: ssrMocks,
        },
        {
          find: 'framer-motion',
          replacement: ssrMocks,
        },
        {
          find: '@noriginmedia/norigin-spatial-navigation',
          replacement: ssrMocks,
        },
      ],
    },
    build: {
      ssr: true,
      outDir: '../dist/frontend-ssr',
      emptyOutDir: true,
      rollupOptions: {
        input: './src/main-server.tsx',
        external: ['react', 'react-dom/server'],
      },
    },
    ssr: {
      noExternal: ['styled-components', 'zod'],
    },
  });
});
