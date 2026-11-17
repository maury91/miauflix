import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  CARD_IMAGE_LOGO_BOX,
  CARD_IMAGE_SIZES,
  type CardImageFormat,
  type CardImageSize,
  cardTitleRenderable,
} from '@miauflix/service-contracts';
import sharp, { type OverlayOptions } from 'sharp';

import { logger } from '../logger';
import { ByteLru } from '../utils/byte-lru';
import { SingleFlight } from '../utils/single-flight';

const SCOPE = 'CardImages';

export const DEFAULT_CARD_IMAGE_CACHE_MB = 100;
/** Bump when the drawing changes, so cached images are not served for the new layout. */
const LAYOUT_VERSION = 1;
const MASTER = CARD_IMAGE_SIZES.lg;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
/** Masters drawn at once: each downloads two images from the provider. */
const MAX_CONCURRENT_MASTERS = 4;
/** The name's size without a logo, as a share of the card's height (shrunk to fit the box). */
const TITLE_SIZE = 0.105;
const TITLE_SHADOW_BLUR = 5;

export interface CardImageSource {
  /** The backdrop's URL (a TMDB URL or path, any size: the master size is requested). */
  backdrop: string;
  /** The card logo's URL, or '' to draw the name instead. */
  logo: string;
  /** The title's name, drawn when there is no logo. */
  title: string;
}

export interface CardImage {
  bytes: Bytes;
  contentType: string;
  /** Changes whenever the drawn image does. */
  etag: string;
}

type Bytes = Uint8Array<ArrayBuffer>;

export type ImageFetcher = (url: string) => Promise<Buffer>;

const CONTENT_TYPES: Record<CardImageFormat, string> = {
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

/** A provider image URL (or bare path) at the given rendition. */
export function providerImageUrl(url: string, size: string): string {
  if (/^https?:\/\/[^/]+\/t\/p\/[^/]+\//u.test(url))
    return url.replace(/(\/t\/p\/)[^/]+\//u, `$1${size}/`);
  return url.startsWith('/') ? `https://image.tmdb.org/t/p/${size}${url}` : url;
}

const fetchImage: ImageFetcher = async url => {
  const response = await fetch(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Image request failed (${response.status}): ${url}`);
  const length = Number(response.headers.get('content-length'));
  if (length > MAX_SOURCE_BYTES) throw new Error(`Image too large (${length} bytes): ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > MAX_SOURCE_BYTES) throw new Error(`Image too large: ${url}`);
  return bytes;
};

const escapeMarkup = (text: string): string =>
  text.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;');

/** The card image cache's capacity from CARD_IMAGE_CACHE_MB (megabytes; 0 caches nothing). */
export function cardImageCacheBytes(value: string | undefined): number {
  const megabytes = Number(value || DEFAULT_CARD_IMAGE_CACHE_MB);
  return Math.floor(
    (Number.isFinite(megabytes) ? Math.max(0, megabytes) : DEFAULT_CARD_IMAGE_CACHE_MB) *
      1024 *
      1024
  );
}

/** The bundled font for names, or the one CARD_IMAGE_FONT_FILE names; undefined if missing. */
export function defaultFontFile(): string | undefined {
  const file =
    process.env.CARD_IMAGE_FONT_FILE ??
    fileURLToPath(new URL('../../assets/fonts/Poppins-SemiBold.ttf', import.meta.url));
  return existsSync(file) ? file : undefined;
}

/**
 * Draws card images: the backdrop at the largest size with the card logo (or the name) in the
 * logo box, then each requested size and format scaled from it. Masters and the sized images all
 * share one least-recently-used cache bounded in bytes, so the popular titles stay drawn.
 */
export class CardImageService {
  private readonly cache: ByteLru<Bytes>;
  private readonly flights = new SingleFlight();
  private running = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(
    cacheBytes = DEFAULT_CARD_IMAGE_CACHE_MB * 1024 * 1024,
    private readonly fetcher: ImageFetcher = fetchImage,
    private readonly fontFile: string | undefined = defaultFontFile()
  ) {
    this.cache = new ByteLru(cacheBytes);
  }

  get cachedBytes(): number {
    return this.cache.bytes;
  }

  setCacheBytes(bytes: number): void {
    this.cache.resize(bytes);
  }

  async render(
    source: CardImageSource,
    size: CardImageSize,
    format: CardImageFormat
  ): Promise<CardImage> {
    const masterKey = this.masterKey(source);
    const key = `${masterKey}:${size}:${format}`;
    const contentType = CONTENT_TYPES[format];
    const etag = `"${key}"`;
    const cached = this.cache.get(key);
    if (cached) return { bytes: cached, contentType, etag };
    const bytes = await this.flights.run(key, async () => {
      const master = await this.master(masterKey, source);
      const { width, height } = CARD_IMAGE_SIZES[size];
      let image = sharp(master);
      if (width !== MASTER.width) image = image.resize(width, height);
      const encoded = new Uint8Array(
        await (
          format === 'webp'
            ? image.webp({ quality: 80, effort: 4 })
            : image.jpeg({ quality: 82, progressive: false, mozjpeg: false })
        ).toBuffer()
      );
      this.cache.set(key, encoded);
      return encoded;
    });
    return { bytes, contentType, etag };
  }

  private masterKey(source: CardImageSource): string {
    const name = source.logo || !cardTitleRenderable(source.title) ? '' : source.title;
    return createHash('sha1')
      .update(JSON.stringify([LAYOUT_VERSION, source.backdrop, source.logo, name]))
      .digest('base64url')
      .slice(0, 22);
  }

  /** The drawn image at the largest size, losslessly enough to scale from (JPEG at 95). */
  private master(key: string, source: CardImageSource): Promise<Bytes> {
    const cacheKey = `${key}:master`;
    const cached = this.cache.get(cacheKey);
    if (cached) return Promise.resolve(cached);
    return this.flights.run(cacheKey, () =>
      this.limited(async () => {
        const started = performance.now();
        const master = await this.draw(source);
        this.cache.set(cacheKey, master);
        logger.debug(SCOPE, 'Card image drawn', {
          ms: Math.round(performance.now() - started),
          bytes: master.byteLength,
          cachedBytes: this.cache.bytes,
        });
        return master;
      })
    );
  }

  private async draw(source: CardImageSource): Promise<Bytes> {
    const box = {
      left: Math.round(MASTER.width * CARD_IMAGE_LOGO_BOX.left),
      top: Math.round(MASTER.height * CARD_IMAGE_LOGO_BOX.top),
      width: Math.round(MASTER.width * CARD_IMAGE_LOGO_BOX.width),
      bottom: Math.round(MASTER.height * CARD_IMAGE_LOGO_BOX.bottom),
    };
    const boxHeight = box.bottom - box.top;
    const [backdrop, overlays] = await Promise.all([
      this.fetcher(providerImageUrl(source.backdrop, 'w780')),
      source.logo
        ? this.logoLayer(source.logo, box.width, boxHeight).then(logo => [
            { input: logo.data, left: box.left, top: box.bottom - logo.info.height },
          ])
        : cardTitleRenderable(source.title)
          ? this.titleLayers(source.title, box, boxHeight)
          : Promise.resolve([]),
    ]);
    const image = await sharp(backdrop)
      .resize(MASTER.width, MASTER.height, { fit: 'cover', position: 'centre' })
      .composite(overlays)
      .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
      .toBuffer();
    return new Uint8Array(image);
  }

  private async logoLayer(url: string, width: number, height: number) {
    const bytes = await this.fetcher(providerImageUrl(url, 'w500'));
    // An SVG logo rasterizes at its own size: a higher density keeps it sharp when scaled up
    const vector = /\.svg$/iu.test(url);
    return sharp(bytes, vector ? { density: 288 } : {})
      .resize(width, height, { fit: 'inside' })
      .png()
      .toBuffer({ resolveWithObject: true });
  }

  /** The name in white over a soft shadow, held at the box's bottom start corner. */
  private async titleLayers(
    title: string,
    box: { left: number; bottom: number; width: number },
    boxHeight: number
  ): Promise<OverlayOptions[]> {
    const fontSize = Math.round(MASTER.height * TITLE_SIZE);
    const render = (color: string, fit: boolean) =>
      sharp({
        text: {
          text: `<span foreground="${color}">${escapeMarkup(title)}</span>`,
          font: `Poppins SemiBold ${fontSize}`,
          fontfile: this.fontFile,
          width: box.width,
          // Too tall at the set size: shrink to fit the box instead
          height: fit ? boxHeight : undefined,
          wrap: 'word',
          align: 'left',
          rgba: true,
        },
      })
        .png()
        .toBuffer({ resolveWithObject: true });
    let text = await render('white', false);
    const fit = text.info.height > boxHeight;
    if (fit) text = await render('white', true);
    const pad = TITLE_SHADOW_BLUR * 3;
    const shadow = await sharp((await render('black', fit)).data)
      .extend({
        top: pad,
        bottom: pad,
        left: pad,
        right: pad,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .blur(TITLE_SHADOW_BLUR)
      .png()
      .toBuffer();
    const top = box.bottom - text.info.height;
    return [
      { input: shadow, left: box.left - pad, top: top - pad + 2 },
      { input: text.data, left: box.left, top },
    ];
  }

  private async limited<T>(operation: () => Promise<T>): Promise<T> {
    if (this.running >= MAX_CONCURRENT_MASTERS)
      await new Promise<void>(resolve => this.waiting.push(resolve));
    this.running += 1;
    try {
      return await operation();
    } finally {
      this.running -= 1;
      this.waiting.shift()?.();
    }
  }
}
