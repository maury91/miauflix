import { deflateSync, inflateSync } from 'node:zlib';

import sharp from 'sharp';

import {
  ARTWORK_BACKDROP_HEIGHT,
  ARTWORK_BACKDROP_WIDTH,
  measureLogoContrast,
  relativeLuminance,
} from '../services/artwork-contrast';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 40_000_000;
const LOGO_WIDTH = 256;
const LOGO_HEIGHT = 117;

type Request =
  | { id: number; type: 'prepare'; url: string }
  | { id: number; type: 'prepare-buffer'; png: string }
  | {
      id: number;
      type: 'measure';
      backdropPng: string;
      backdropLuminance: string;
      logoUrl: string;
      decodedPng?: string;
    };

async function download(urlText: string, allowJpeg = true): Promise<Buffer> {
  const url = new URL(urlText);
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'image.tmdb.org' ||
    url.port ||
    !url.pathname.startsWith('/t/p/w300/') ||
    !(allowJpeg ? /\.(?:png|jpe?g)$/iu : /\.png$/iu).test(url.pathname)
  )
    throw new Error('artwork_url_rejected');
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000), redirect: 'error' });
  if (!response.ok) throw new Error(`artwork_download_${response.status}`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error('artwork_body_missing');
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_IMAGE_BYTES) throw new Error('artwork_image_too_large');
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map(chunk => Buffer.from(chunk)));
}

async function processRequest(request: Request) {
  if (request.type === 'prepare' || request.type === 'prepare-buffer') {
    const source =
      request.type === 'prepare' ? await download(request.url) : Buffer.from(request.png, 'base64');
    if (source.byteLength > MAX_IMAGE_BYTES) throw new Error('artwork_image_too_large');
    const metadata = await sharp(source, { limitInputPixels: MAX_IMAGE_PIXELS }).metadata();
    if (!metadata.width || !metadata.height || metadata.width * metadata.height > MAX_IMAGE_PIXELS)
      throw new Error('artwork_image_dimensions_invalid');
    const raw = await sharp(source, { limitInputPixels: MAX_IMAGE_PIXELS })
      .rotate()
      .resize(ARTWORK_BACKDROP_WIDTH, ARTWORK_BACKDROP_HEIGHT, { fit: 'cover', position: 'centre' })
      .toColourspace('srgb')
      .ensureAlpha()
      .raw()
      .toBuffer();
    const luminance = new Float32Array(ARTWORK_BACKDROP_WIDTH * ARTWORK_BACKDROP_HEIGHT);
    for (let y = 0; y < ARTWORK_BACKDROP_HEIGHT; y++) {
      const darken = 0.75 * Math.max(0, ((y + 0.5) / ARTWORK_BACKDROP_HEIGHT - 0.35) / 0.65);
      for (let x = 0; x < ARTWORK_BACKDROP_WIDTH; x++) {
        const index = (y * ARTWORK_BACKDROP_WIDTH + x) * 4;
        raw[index] = Math.round(raw[index]! * (1 - darken));
        raw[index + 1] = Math.round(raw[index + 1]! * (1 - darken));
        raw[index + 2] = Math.round(raw[index + 2]! * (1 - darken));
        luminance[y * ARTWORK_BACKDROP_WIDTH + x] = relativeLuminance([
          raw[index]!,
          raw[index + 1]!,
          raw[index + 2]!,
        ]);
      }
    }
    const png = await sharp(raw, {
      raw: { width: ARTWORK_BACKDROP_WIDTH, height: ARTWORK_BACKDROP_HEIGHT, channels: 4 },
    })
      .png()
      .toBuffer();
    const luminanceBuffer = Buffer.from(
      luminance.buffer,
      luminance.byteOffset,
      luminance.byteLength
    );
    const compressedLuminance = deflateSync(luminanceBuffer).toString('base64');
    const encodedPng = png.toString('base64');
    return {
      type: 'backdrop',
      png: encodedPng,
      luminance: compressedLuminance,
      pixelBytes: encodedPng.length + compressedLuminance.length,
    };
  }

  const backdrop = await sharp(Buffer.from(request.backdropPng, 'base64'), {
    limitInputPixels: MAX_IMAGE_PIXELS,
  })
    .ensureAlpha()
    .raw()
    .toBuffer();
  const luminanceBuffer = inflateSync(Buffer.from(request.backdropLuminance, 'base64'));
  const backdropLuminance = new Float32Array(luminanceBuffer.byteLength / 4);
  new Uint8Array(backdropLuminance.buffer).set(luminanceBuffer);
  const source = request.decodedPng
    ? Buffer.from(request.decodedPng, 'base64')
    : await download(request.logoUrl, false);
  if (source.byteLength > MAX_IMAGE_BYTES) throw new Error('artwork_image_too_large');
  const metadata = await sharp(source, { limitInputPixels: MAX_IMAGE_PIXELS }).metadata();
  if (!metadata.width || !metadata.height || metadata.width * metadata.height > MAX_IMAGE_PIXELS)
    throw new Error('artwork_image_dimensions_invalid');
  const resized = await sharp(source, { limitInputPixels: MAX_IMAGE_PIXELS })
    .rotate()
    .resize(LOGO_WIDTH, LOGO_HEIGHT, { fit: 'inside', withoutEnlargement: true })
    .toColourspace('srgb')
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const png = await sharp(resized.data, {
    raw: { width: resized.info.width, height: resized.info.height, channels: 4 },
  })
    .png()
    .toBuffer();
  return {
    type: 'logo',
    width: resized.info.width,
    height: resized.info.height,
    decodedPng: png.toString('base64'),
    card: measureLogoContrast(
      resized.data,
      resized.info.width,
      resized.info.height,
      backdrop,
      backdropLuminance,
      false
    ),
    hero: measureLogoContrast(
      resized.data,
      resized.info.width,
      resized.info.height,
      backdrop,
      backdropLuminance,
      true
    ),
  };
}

const scope = globalThis as typeof globalThis & {
  onmessage?: (event: MessageEvent<Request>) => void;
  postMessage: (message: unknown) => void;
};
scope.onmessage = event => {
  const request = event.data;
  void (async () => {
    try {
      const result = await processRequest(request);
      scope.postMessage({ id: request.id, ok: true, result });
    } catch (error) {
      scope.postMessage({
        id: request.id,
        ok: false,
        error: error instanceof Error ? error.message : 'artwork_analysis_failed',
      });
    }
  })();
};
