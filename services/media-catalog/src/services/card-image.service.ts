import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  CARD_IMAGE_LAYOUT_VERSION,
  CARD_IMAGE_LOGO_BOX,
  CARD_IMAGE_SIZES,
  type CardImageFormat,
  type CardImageSize,
  cardTitleRenderable,
} from '@miauwatch/service-contracts';
import sharp, { type OverlayOptions } from 'sharp';

import { logger } from '../logger';
import { ByteLru } from '../utils/byte-lru';
import { SharedJobs } from '../utils/single-flight';

const SCOPE = 'CardImages';

export const DEFAULT_CARD_IMAGE_CACHE_MB = 100;
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

/** The only place card images download from: TMDB's image server, over HTTPS. */
const IMAGE_ORIGIN = 'https://image.tmdb.org';

/**
 * The URL to download a provider image from, refusing any other origin: stored artwork URLs are
 * built from the provider's configuration, so a card image must not fetch wherever they point.
 */
export function approvedImageUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Not an image URL: ${url}`);
  }
  // The protocol too: a blob: URL reports the origin of the URL it wraps
  if (parsed.protocol !== 'https:' || parsed.origin !== IMAGE_ORIGIN)
    throw new Error(`Image origin not allowed: ${url}`);
  return parsed.href;
}

/** A provider image URL (or bare path) at the given rendition. */
export function providerImageUrl(url: string, size: string): string {
  if (/^https?:\/\/[^/]+\/t\/p\/[^/]+\//u.test(url))
    return url.replace(/(\/t\/p\/)[^/]+\//u, `$1${size}/`);
  return url.startsWith('/') ? `https://image.tmdb.org/t/p/${size}${url}` : url;
}

/** Downloads a provider image, refusing (and no longer reading) one over MAX_SOURCE_BYTES. */
export const fetchImage: ImageFetcher = async url => {
  const response = await fetch(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  // Rejected before reading: cancel the body, so the download stops once the slot is given back
  const refuse = async (message: string): Promise<never> => {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(message);
  };
  if (!response.ok) return refuse(`Image request failed (${response.status}): ${url}`);
  const length = Number(response.headers.get('content-length'));
  if (length > MAX_SOURCE_BYTES) return refuse(`Image too large (${length} bytes): ${url}`);
  // Read in chunks: a body without a length must not be buffered whole before the check
  const chunks: Uint8Array[] = [];
  let received = 0;
  const reader = response.body?.getReader();
  if (!reader) throw new Error(`Image request had no body: ${url}`);
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_SOURCE_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new Error(`Image too large: ${url}`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, received);
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
  private readonly jobs = new SharedJobs();
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

  /**
   * `signal`: the caller no longer needs the image. A drawing still waiting for a slot is dropped
   * once no caller needs it; one already drawing finishes (and is cached).
   */
  async render(
    source: CardImageSource,
    size: CardImageSize,
    format: CardImageFormat,
    signal?: AbortSignal
  ): Promise<CardImage> {
    const masterKey = this.masterKey(source);
    const key = `${masterKey}:${size}:${format}`;
    const contentType = CONTENT_TYPES[format];
    const etag = `"${key}"`;
    const cached = this.cache.get(key);
    if (cached) return { bytes: cached, contentType, etag };
    const bytes = await this.jobs.run(
      key,
      async jobSignal => {
        const master = await this.master(masterKey, source, jobSignal);
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
      },
      signal
    );
    return { bytes, contentType, etag };
  }

  private masterKey(source: CardImageSource): string {
    const name = source.logo || !cardTitleRenderable(source.title) ? '' : source.title;
    return createHash('sha1')
      .update(JSON.stringify([CARD_IMAGE_LAYOUT_VERSION, source.backdrop, source.logo, name]))
      .digest('base64url')
      .slice(0, 22);
  }

  /** The drawn image at the largest size, losslessly enough to scale from (JPEG at 95). */
  private master(key: string, source: CardImageSource, signal: AbortSignal): Promise<Bytes> {
    const cacheKey = `${key}:master`;
    const cached = this.cache.get(cacheKey);
    if (cached) return Promise.resolve(cached);
    return this.jobs.run(
      cacheKey,
      (jobSignal, commit) =>
        this.limited(jobSignal, async () => {
          // Drawing ignores the signal: keep it joinable until it is cached
          commit();
          const started = performance.now();
          const master = await this.draw(source);
          this.cache.set(cacheKey, master);
          logger.debug(SCOPE, 'Card image drawn', {
            ms: Math.round(performance.now() - started),
            bytes: master.byteLength,
            cachedBytes: this.cache.bytes,
          });
          return master;
        }),
      signal
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
    // Both settle before the slot is given back, so a failed logo never leaves the backdrop's
    // download running beside the next master's
    const [backdropResult, overlaysResult] = await Promise.allSettled([
      this.fetcher(approvedImageUrl(providerImageUrl(source.backdrop, 'w780'))),
      source.logo
        ? this.logoLayer(source.logo, box.width, boxHeight).then(logo => [
            { input: logo.data, left: box.left, top: box.bottom - logo.info.height },
          ])
        : cardTitleRenderable(source.title)
          ? this.titleLayers(source.title, box, boxHeight)
          : Promise.resolve([]),
    ]);
    if (backdropResult.status === 'rejected') throw backdropResult.reason;
    if (overlaysResult.status === 'rejected') throw overlaysResult.reason;
    const backdrop = backdropResult.value;
    const overlays = overlaysResult.value;
    const image = await sharp(backdrop)
      .resize(MASTER.width, MASTER.height, { fit: 'cover', position: 'centre' })
      .composite(overlays)
      .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
      .toBuffer();
    return new Uint8Array(image);
  }

  private async logoLayer(url: string, width: number, height: number) {
    const bytes = await this.fetcher(approvedImageUrl(providerImageUrl(url, 'w500')));
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

  /** Runs `operation` in one of the master slots; while waiting, an aborted `signal` leaves the queue. */
  private async limited<T>(signal: AbortSignal, operation: () => Promise<T>): Promise<T> {
    await this.acquire(signal);
    try {
      // The caller may have left between the slot being granted and this resuming
      signal.throwIfAborted();
      return await operation();
    } finally {
      // The slot passes straight to the next waiter, so no newcomer can take it in between
      const next = this.waiting.shift();
      if (next) next();
      else this.running -= 1;
    }
  }

  private acquire(signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    if (this.running < MAX_CONCURRENT_MASTERS) {
      this.running += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const granted = () => {
        signal.removeEventListener('abort', cancel);
        resolve();
      };
      const cancel = () => {
        const index = this.waiting.indexOf(granted);
        if (index >= 0) this.waiting.splice(index, 1);
        reject(signal.reason);
      };
      this.waiting.push(granted);
      signal.addEventListener('abort', cancel, { once: true });
    });
  }
}
