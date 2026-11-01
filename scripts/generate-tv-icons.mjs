#!/usr/bin/env node

// Generate the TV app icons from assets/tv-logo.png, the only source of the TV icons: nothing
// generated here is committed. scripts/package-tizen.sh runs it on every TV build.
//
// Usage: node scripts/generate-tv-icons.mjs <output dir>   (default: dist/frontend-tizen)
//
// Writes, under the output dir:
//
//   icon.png    512x423 px Samsung TV launcher icon (frontend/tizen/config.xml)
//
// The source is square, with blank background along its edges; an icon that isn't square gets
// the logo at full height (or width), with that background extended to the sides.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'assets/tv-logo.png');
const outDir = path.resolve(root, process.argv[2] ?? 'dist/frontend-tizen');

const ICONS = [{ file: 'icon.png', width: 512, height: 423 }];

/** Share of the logo's side, along each edge, that is blank background. */
const EDGE = 0.07;

/**
 * The logo fitted inside width x height, the rest filled with its background: the blank strip
 * along each edge, mirrored outwards (and stretched when the gap is wider than the strip).
 */
async function icon(width, height) {
  const size = Math.min(width, height);
  const logo = await sharp(source)
    .resize(size, size, { fit: 'cover', kernel: 'lanczos3' })
    .flatten({ background: '#000' })
    .toBuffer();
  const strip = Math.max(1, Math.floor(size * EDGE));
  const left = Math.floor((width - size) / 2);
  const top = Math.floor((height - size) / 2);

  /** The strip of the logo at region, mirrored and stretched to fill target. */
  const fill = async (region, target, mirror) => ({
    input: await sharp(logo)
      .extract(region)
      [mirror]()
      .resize(target.width, target.height, { fit: 'fill' })
      .toBuffer(),
    left: target.left,
    top: target.top,
  });

  const sides = [];
  if (left > 0) {
    const right = width - size - left;
    sides.push(
      await fill(
        { left: 0, top: 0, width: strip, height: size },
        { left: 0, top, width: left, height: size },
        'flop'
      ),
      await fill(
        { left: size - strip, top: 0, width: strip, height: size },
        { left: left + size, top, width: right, height: size },
        'flop'
      )
    );
  }
  if (top > 0) {
    const bottom = height - size - top;
    sides.push(
      await fill(
        { left: 0, top: 0, width: size, height: strip },
        { left, top: 0, width: size, height: top },
        'flip'
      ),
      await fill(
        { left: 0, top: size - strip, width: size, height: strip },
        { left, top: top + size, width: size, height: bottom },
        'flip'
      )
    );
  }

  return sharp({ create: { width, height, channels: 3, background: '#000' } })
    .composite([...sides, { input: logo, left, top }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function main() {
  const { width, height } = await sharp(source).metadata();
  if (width !== height) {
    throw new Error(`${source} is ${width}x${height}; the TV logo must be square`);
  }
  const largest = Math.max(...ICONS.map(({ width, height }) => Math.min(width, height)));
  if (width < largest) {
    console.warn(`${source} is only ${width}px wide; the ${largest}px icons will be upscaled`);
  }

  await mkdir(outDir, { recursive: true });
  for (const { file, width, height } of ICONS) {
    const data = await icon(width, height);
    const target = path.join(outDir, file);
    await writeFile(target, data);
    console.log(`${path.relative(root, target)} (${width}x${height}, ${data.length} bytes)`);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
