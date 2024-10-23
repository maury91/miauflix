/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';

const tizenBuild = process.env.VITE_TIZEN === 'true';

if (tizenBuild) {
  console.log('executing tizen build');
}

export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/apps/miauflix',

  server: {
    port: 1919,
    host: 'localhost',
  },

  preview: {
    port: 1920,
    host: 'localhost',
  },

  plugins: [react(), nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],

  // Uncomment this if you are using workers.
  // worker: {
  //  plugins: [ nxViteTsPaths() ],
  // },

  build: {
    outDir: '../../dist/apps/miauflix',
    emptyOutDir: true,
    reportCompressedSize: true,
    target: tizenBuild ? 'es2019' : 'modules',
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
});
