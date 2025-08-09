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

  return mergeConfig(baseConfig, {
    resolve: {
      alias: [
        // Replace problematic imports with SSR-safe mocks
        { find: /^gsap$/, replacement: path.resolve(dirname, 'src/ssr-mocks.ts') },
        { find: /^gsap\/.*$/, replacement: path.resolve(dirname, 'src/ssr-mocks.ts') },
        { find: 'framer-motion', replacement: path.resolve(dirname, 'src/ssr-mocks.ts') },
        {
          find: '@noriginmedia/norigin-spatial-navigation',
          replacement: path.resolve(dirname, 'src/ssr-mocks.ts'),
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
      noExternal: ['styled-components'],
    },
  });
});
