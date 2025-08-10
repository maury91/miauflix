import path from 'path';
import { fileURLToPath } from 'url';
import { build } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function buildSSR(): Promise<void> {
  console.log('Building SSR server entry...');

  // Build the server entry first
  await build({
    configFile: path.resolve(__dirname, 'vite.ssr.config.ts'),
  });

  console.log('Building client bundle with SSR injection...');

  // Build the client bundle - the SSR plugin in vite.config.ts will handle injection
  await build({
    configFile: path.resolve(__dirname, 'vite.config.ts'),
  });

  console.log('✅ SSR build completed!');
}

buildSSR().catch((error: unknown) => {
  console.error('Build failed:', error);
  process.exit(1);
});
