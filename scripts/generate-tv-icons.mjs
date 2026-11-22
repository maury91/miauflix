#!/usr/bin/env node

// Generate the Samsung TV launcher icon from the square brand mark at package time.
// Usage: node scripts/generate-tv-icons.mjs <output dir>   (default: dist/frontend-tizen)

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'frontend/public/favicon.svg');
const outDir = path.resolve(root, process.argv[2] ?? 'dist/frontend-tizen');
const width = 512;
const height = 423;
const background = '#000';

async function main() {
  const data = await sharp(source)
    .resize(width, height, { fit: 'contain', background })
    .flatten({ background })
    .png({ compressionLevel: 9 })
    .toBuffer();

  await mkdir(outDir, { recursive: true });
  const target = path.join(outDir, 'icon.png');
  await writeFile(target, data);
  console.log(`${path.relative(root, target)} (${width}x${height}, ${data.length} bytes)`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
