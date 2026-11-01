#!/usr/bin/env node

// Generate the website icons from one square source image (the TV icons come from
// assets/tv-logo.png, see generate-tv-icons.mjs).
//
// Usage: npm run generate:icons [-- path/to/source.png]   (default: assets/favicon.png)
//
// Writes, under frontend/ (keeping the source's transparency):
//
//   public/favicon.ico                    16, 32 and 48 px, for browsers that ask for /favicon.ico
//   public/favicon.png                    512 px
//   public/assets/icons/favicon-16.png    <link rel="icon">
//   public/assets/icons/favicon-32.png    <link rel="icon">
//   public/assets/icons/apple-touch-icon.png  180 px, iOS home screen

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.resolve(root, process.argv[2] ?? 'assets/favicon.png');
const publicDir = path.join(root, 'frontend/public');
const iconsDir = path.join(publicDir, 'assets/icons');

/** A transparent square icon (32-bit, which ICO readers also expect). */
async function squarePng(size) {
  return sharp(source)
    .resize(size, size, { fit: 'cover', kernel: 'lanczos3' })
    .ensureAlpha()
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** An ICO file holding PNG images (supported by every browser that reads ICO). */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  let offset = header.length + images.length * 16;
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 means 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // palette colours
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });

  return Buffer.concat([header, ...entries, ...images.map(({ data }) => data)]);
}

async function main() {
  const { width, height } = await sharp(source).metadata();
  if (width !== height) {
    throw new Error(`${source} is ${width}x${height}; the icon source must be square`);
  }
  if (width < 512) {
    console.warn(`${source} is only ${width}px wide; the 512px icons will be upscaled`);
  }

  await mkdir(iconsDir, { recursive: true });

  const outputs = {
    [path.join(iconsDir, 'favicon-16.png')]: await squarePng(16),
    [path.join(iconsDir, 'favicon-32.png')]: await squarePng(32),
    [path.join(iconsDir, 'apple-touch-icon.png')]: await squarePng(180),
    [path.join(publicDir, 'favicon.png')]: await squarePng(512),
    [path.join(publicDir, 'favicon.ico')]: ico(
      await Promise.all([16, 32, 48].map(async size => ({ size, data: await squarePng(size) })))
    ),
  };

  for (const [file, data] of Object.entries(outputs)) {
    await writeFile(file, data);
    console.log(`${path.relative(root, file)} (${data.length} bytes)`);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
