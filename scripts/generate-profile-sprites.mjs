#!/usr/bin/env node

// Generate the profile editor's option pictures from the original sprite sheets.
//
// Usage: npm run generate:profile-sprites (always regenerates)
//        node scripts/generate-profile-sprites.mjs --if-stale (skips when the pictures are newer
//        than the originals, the config and this script; the frontend's build, dev and Storybook
//        scripts run it this way, since the pictures are not committed)
//
// Reads assets/profile/<file>.png (the full-size originals, not shipped): each lays out a
// category's options on a grid, left to right then top to bottom. For each sheet and screen
// density in sprite-sheets.json it writes frontend/public/assets/profile/<file>@<d>.png: the same
// grid, but with cells of exactly one tile picture (`areaWidth` × `areaWidth / areaRatio` CSS
// pixels at @1, i.e. 100 × 75; two and three times that at @2 and @3), each option centred in its
// cell.
//
// Sheets with a transparent background (`cutout`) have each option cut out by its own pixels:
// an item reaching into a neighbouring cell (a hat brim) stays whole and does not show up next
// door. Opaque sheets take a fixed `crop` around each cell's centre.

import { mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(root, 'assets/profile');
const outputDir = path.join(root, 'frontend/public/assets/profile');
const configPath = path.join(root, 'frontend/src/features/profiles/avatar/sprite-sheets.json');
const config = JSON.parse(await readFile(configPath, 'utf8'));

const modified = async file => (await stat(file).catch(() => null))?.mtimeMs ?? null;

/** Whether every picture exists and is newer than everything it is made from. */
async function upToDate() {
  const sheets = Object.values(config.sheets);
  const inputs = await Promise.all([
    modified(configPath),
    modified(fileURLToPath(import.meta.url)),
    ...sheets.map(sheet => modified(path.join(sourceDir, `${sheet.file}.png`))),
  ]);
  const outputs = await Promise.all(
    sheets.flatMap(sheet =>
      config.densities.map(density =>
        modified(path.join(outputDir, `${sheet.file}@${density}.png`))
      )
    )
  );
  if (inputs.includes(null) || outputs.includes(null)) return false;
  return Math.min(...outputs) >= Math.max(...inputs);
}

if (process.argv.includes('--if-stale') && (await upToDate())) {
  console.log('Profile sprites are up to date');
  process.exit(0);
}

/** Pixels at least this opaque belong to an item. */
const ALPHA_THRESHOLD = 24;
/** Specks smaller than this (stray fringe pixels) are dropped. */
const MIN_SPECK = 40;

/**
 * Label the opaque regions of an RGBA image (8-connected) and give each to the grid cell holding
 * its centre. Returns, per cell, the region's bounds and a per-pixel owner map.
 */
function cutOut({ data, width, height }, sheet) {
  const labels = new Int32Array(width * height).fill(-1);
  const owner = [];
  const cellWidth = width / sheet.columns;
  const cellHeight = height / sheet.rows;
  const stack = new Int32Array(width * height);
  for (let start = 0; start < width * height; start += 1) {
    if (labels[start] !== -1 || data[start * 4 + 3] < ALPHA_THRESHOLD) continue;
    const label = owner.length;
    let size = 0;
    let sumX = 0;
    let sumY = 0;
    let top = 1;
    stack[0] = start;
    labels[start] = label;
    while (top) {
      const index = stack[--top];
      const x = index % width;
      const y = (index - x) / width;
      size += 1;
      sumX += x;
      sumY += y;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const next = ny * width + nx;
          if (labels[next] !== -1 || data[next * 4 + 3] < ALPHA_THRESHOLD) continue;
          labels[next] = label;
          stack[top++] = next;
        }
      }
    }
    const column = Math.min(sheet.columns - 1, Math.floor(sumX / size / cellWidth));
    const row = Math.min(sheet.rows - 1, Math.floor(sumY / size / cellHeight));
    const cell = row * sheet.columns + column;
    owner.push(size >= MIN_SPECK && cell < sheet.count ? cell : -1);
  }

  const cells = Array.from({ length: sheet.count }, () => ({
    left: Infinity,
    top: Infinity,
    right: -1,
    bottom: -1,
  }));
  const cellOf = new Int16Array(width * height).fill(-1);
  for (let index = 0; index < width * height; index += 1) {
    const label = labels[index];
    if (label === -1 || owner[label] === -1) continue;
    const cell = owner[label];
    cellOf[index] = cell;
    const x = index % width;
    const y = (index - x) / width;
    const bounds = cells[cell];
    bounds.left = Math.min(bounds.left, x);
    bounds.top = Math.min(bounds.top, y);
    bounds.right = Math.max(bounds.right, x);
    bounds.bottom = Math.max(bounds.bottom, y);
  }
  // Semi-transparent fringe pixels next to an item's edge belong to it too.
  for (let index = 0; index < width * height; index += 1) {
    if (cellOf[index] !== -1 || data[index * 4 + 3] === 0) continue;
    const x = index % width;
    const y = (index - x) / width;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const neighbour = cellOf[ny * width + nx];
      if (neighbour >= 0 && data[(ny * width + nx) * 4 + 3] >= ALPHA_THRESHOLD) {
        cellOf[index] = neighbour + 10_000; // marked; resolved below so it does not chain
        break;
      }
    }
  }
  for (let index = 0; index < width * height; index += 1) {
    if (cellOf[index] >= 10_000) cellOf[index] -= 10_000;
  }
  cells.forEach((bounds, cell) => {
    if (bounds.right < 0) throw new Error(`${sheet.file}: option ${cell + 1} has no pixels`);
  });
  return { cells, cellOf };
}

/** One option's pixels, cut out of the sheet: a raw RGBA image of its bounds. */
function extractCutout({ data, width }, { left, top, right, bottom }, cellOf, cell) {
  const outWidth = right - left + 1;
  const outHeight = bottom - top + 1;
  const out = Buffer.alloc(outWidth * outHeight * 4);
  for (let y = 0; y < outHeight; y += 1) {
    for (let x = 0; x < outWidth; x += 1) {
      const source = (top + y) * width + left + x;
      if (cellOf[source] !== cell) continue;
      data.copy(out, (y * outWidth + x) * 4, source * 4, source * 4 + 4);
    }
  }
  return sharp(out, { raw: { width: outWidth, height: outHeight, channels: 4 } });
}

/** One option's crop around its cell's centre, for sheets on an opaque background. */
function extractCrop(source, image, sheet, cell) {
  const cellWidth = image.width / sheet.columns;
  const cellHeight = image.height / sheet.rows;
  const centreX = ((cell % sheet.columns) + 0.5) * cellWidth;
  const centreY = (Math.floor(cell / sheet.columns) + 0.5) * cellHeight;
  const left = Math.max(0, Math.round(centreX - sheet.crop.width / 2));
  const top = Math.max(0, Math.round(centreY - sheet.crop.height / 2));
  return sharp(source).extract({
    left,
    top,
    width: Math.min(sheet.crop.width, image.width - left),
    height: Math.min(sheet.crop.height, image.height - top),
  });
}

await mkdir(outputDir, { recursive: true });
// Drop pictures from earlier runs (e.g. a removed density).
for (const name of await readdir(outputDir)) {
  if (/@\d+\.png$/.test(name)) await rm(path.join(outputDir, name));
}

let total = 0;
for (const sheet of Object.values(config.sheets)) {
  const source = path.join(sourceDir, `${sheet.file}.png`);
  const { data, info } = await sharp(source)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.width !== sheet.width || info.height !== sheet.height) {
    throw new Error(
      `${source} is ${info.width}×${info.height}, sprite-sheets.json says ${sheet.width}×${sheet.height}`
    );
  }
  const image = { data, width: info.width, height: info.height };
  const cutouts = sheet.cutout ? cutOut(image, sheet) : null;
  // Full-resolution pictures of each option, extracted once.
  const pictures = await Promise.all(
    Array.from({ length: sheet.count }, (_, cell) =>
      (cutouts
        ? extractCutout(image, cutouts.cells[cell], cutouts.cellOf, cell)
        : extractCrop(source, image, sheet, cell)
      )
        .png()
        .toBuffer()
    )
  );

  for (const density of config.densities) {
    const cellWidth = Math.round(config.areaWidth * density);
    const cellHeight = Math.round((config.areaWidth / config.areaRatio) * density);
    const inset = Math.round(cellHeight * (sheet.padding ?? 0));
    const layers = await Promise.all(
      pictures.map(async (picture, cell) => {
        const { data: resized, info: size } = await sharp(picture)
          .resize(cellWidth - inset * 2, cellHeight - inset * 2, {
            fit: 'inside',
            kernel: 'lanczos3',
          })
          .png()
          .toBuffer({ resolveWithObject: true });
        return {
          input: resized,
          left: (cell % sheet.columns) * cellWidth + Math.floor((cellWidth - size.width) / 2),
          top:
            Math.floor(cell / sheet.columns) * cellHeight +
            Math.floor((cellHeight - size.height) / 2),
        };
      })
    );
    const output = path.join(outputDir, `${sheet.file}@${density}.png`);
    const { size } = await sharp({
      create: {
        width: cellWidth * sheet.columns,
        height: cellHeight * sheet.rows,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite(layers)
      .png({ compressionLevel: 9, effort: 10, palette: true, quality: 90 })
      .toFile(output);
    total += size;
    console.log(
      `${path.relative(root, output)}  ${cellWidth * sheet.columns}×${cellHeight * sheet.rows}  ${(size / 1024).toFixed(0)} KB`
    );
  }
}
console.log(`Total ${(total / 1024).toFixed(0)} KB`);
