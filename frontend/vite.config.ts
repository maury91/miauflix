/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Phase 0 Bootstrap: Comment out NX-specific imports for now
// TODO: Re-enable in future phases when NX workspace is properly configured
// import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
// import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
// import { injectScripts, publicTypescript } from 'vite-plugin-public-typescript';
import Icons from 'unplugin-icons/vite';
// import webfontDownload from 'vite-plugin-webfont-dl';
// import { AssetGlob } from '@nx/js/src/utils/assets/assets';

const tizenBuild = process.env.VITE_TIZEN === 'true';

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
  },

  preview: {
    port: 4174,
    host: 'localhost',
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
    // TODO: Re-enable in future phases
    // webfontDownload(),
    // nxViteTsPaths(),
    // nxCopyAssetsPlugin(assets),
    // ...(tizenBuild ? tizenPlugins : []),
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
  },

  // Phase 0 Bootstrap: Add comprehensive resolve configuration
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/app/components'),
      '@pages': path.resolve(__dirname, './src/app/pages'),
      '@store': path.resolve(__dirname, './src/store'),
      '@types': path.resolve(__dirname, './src/types'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@hooks': path.resolve(__dirname, './src/app/hooks'),
      '@consts': path.resolve(__dirname, './src/consts'),
    },
  },
});
