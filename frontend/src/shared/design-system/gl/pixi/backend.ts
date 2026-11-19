// First: Pixi needs them while it initializes
import './compat/legacy';

import { WebGLRenderer } from 'pixi.js';

import { FrameBudget, FrameScheduler } from '../core/frameScheduler';
import type { GlBackend, GlBackendOptions, GlRendererStats, GlTuning } from '../core/renderer';
import { type GlNode, stepAnimations } from '../core/scene';
import type { ImageStatus } from '../paint/painter';
import { pickEvictions, TEXTURE_BUDGET } from '../resources/textureBudget';
import { quietPixiGlWarnings } from './compat/pixiWorkarounds';
import { FadeIns } from './fadeIns';
import type { FrameInfo } from './nodeState';
import { PictureBaker } from './pictures';
import { createPixiPainter } from './pixiPainter';
import { SceneSync } from './sync';
import { TextureStore } from './textures';

/**
 * Background work per frame (uploads, text, picture bakes share it), ms. The spike's separate
 * budgets added up to about this on the TV.
 */
const FRAME_BUDGET_MS = 8;
/** Frames failing in a row before the surface gives up (its caller falls back to the DOM). */
const FRAME_FAILURES_TO_GIVE_UP = 30;

/**
 * The GlNode tree drawn with PixiJS (WebGL), retained the way a game engine draws: each node owns
 * a Container, its paint runs only when it changed, and frames only move containers (SceneSync).
 * Textures come from the TextureStore, component pictures from the PictureBaker. Frames run only
 * while something animates, loads or was invalidated (FrameScheduler).
 */
export class PixiBackend implements GlBackend {
  readonly canvas: HTMLCanvasElement;
  root: GlNode | null = null;
  prefetch = { x: 0, y: 0 };
  readonly stats: GlRendererStats = {
    frames: 0,
    repaints: 0,
    uploads: 0,
    uploadMs: 0,
    textMs: 0,
    frameMs: 0,
    bakes: 0,
    bakeMs: 0,
    arts: 0,
    artDraws: 0,
    artBakes: 0,
    artBakeMs: 0,
    bands: 0,
    textures: 0,
    textureBytes: 0,
    failed: 0,
    errors: 0,
    contextLosses: 0,
    contextRestores: 0,
  };
  lastError = '';

  /** Null until Pixi's async init is done; frames wait for it. */
  pixi: WebGLRenderer | null = null;

  private readonly frame: FrameInfo;
  private readonly scheduler: FrameScheduler;
  private readonly store: TextureStore;
  private readonly fades = new FadeIns();
  private readonly pictures: PictureBaker;
  private readonly sync: SceneSync;
  private readonly onError: (error: unknown) => void;
  private fontsReady = typeof document.fonts === 'undefined' || document.fonts.status === 'loaded';
  private started = false;
  /** Frames that threw in a row. */
  private frameFailures = 0;
  private disposed = false;
  private readonly tuning: Required<GlTuning>;

  constructor({ canvas, width, height, dpr, onError, tuning }: GlBackendOptions) {
    this.canvas = canvas;
    this.onError = onError;
    this.tuning = {
      textureBudget: tuning?.textureBudget ?? TEXTURE_BUDGET,
      antialias: tuning?.antialias ?? true,
      frameBudgetMs: tuning?.frameBudgetMs ?? FRAME_BUDGET_MS,
      preserveDrawingBuffer: tuning?.preserveDrawingBuffer ?? true,
    };
    this.frame = { index: 0, now: 0, dpr, width, height };
    this.scheduler = new FrameScheduler({
      budgetMs: this.tuning.frameBudgetMs,
      frame: this.draw,
      onError: error => {
        this.stats.errors++;
        this.lastError = String((error as Error)?.stack ?? error).slice(0, 500);
        console.error('[gl] frame failed', error);
        // Failing every frame: nothing draws, the caller shows its DOM instead
        if (++this.frameFailures === FRAME_FAILURES_TO_GIVE_UP) this.onError(error);
      },
    });
    const pixi = () => this.pixi!;
    this.store = new TextureStore({
      pixi,
      frame: this.frame,
      invalidate: this.invalidate,
      onSettled: entry => {
        for (const node of entry.users) if (!this.pictures.settled(node)) node.repaint();
      },
    });
    this.pictures = new PictureBaker({
      pixi,
      frame: this.frame,
      store: this.store,
      sync: () => this.sync,
      stats: this.stats,
    });
    this.sync = new SceneSync({
      pixi,
      frame: this.frame,
      store: this.store,
      fades: this.fades,
      prefetch: () => this.prefetch,
      painter: (node, state, baking) =>
        createPixiPainter(
          {
            store: this.store,
            frame: this.frame,
            fades: this.fades,
            picture: art => this.pictures.picture(art),
            held: node => this.pictures.held(node),
            hold: (node, picture) => this.pictures.hold(node, picture),
          },
          node,
          state,
          baking
        ),
      releasePictures: (node, state) => this.pictures.release(node, state),
      stats: this.stats,
    });
    if (!this.fontsReady)
      void document.fonts.ready.then(() => {
        this.fontsReady = true;
        this.invalidate();
      });
  }

  private onFontsLoaded = (event: Event) => {
    if (this.disposed || !this.pixi) return;
    // Only Poppins draws GL text
    const faces = (event as FontFaceSetLoadEvent).fontfaces;
    if (faces && !faces.some(face => face.family.replace(/["']/g, '') === 'Poppins')) return;
    for (const node of this.store.dropTexts()) if (!this.pictures.settled(node)) node.repaint();
    this.pictures.dropTextPictures();
    this.invalidate();
  };

  /** Starts Pixi (async: it loads its renderer modules); the scene builds meanwhile. */
  start() {
    if (this.started) return;
    this.started = true;
    // Here, not in the constructor: a backend React creates and discards (StrictMode runs state
    // initializers twice) never starts, so it never listens. A face that loads later (a weight
    // first used now): texts drawn meanwhile used the fallback
    if (typeof document.fonts !== 'undefined')
      document.fonts.addEventListener('loadingdone', this.onFontsLoaded);
    const { canvas } = this;
    const { width, height, dpr } = this.frame;
    const pixi = new WebGLRenderer();
    pixi
      .init({
        canvas,
        width,
        height,
        resolution: dpr,
        autoDensity: false,
        backgroundAlpha: 0,
        antialias: this.tuning.antialias,
        preserveDrawingBuffer: this.tuning.preserveDrawingBuffer,
        // Our textures are evicted by the budget. Pixi's collector frees GPU textures unused for
        // a minute and re-uploads them from their source, but the bitmaps are closed after
        // upload: tiles came back empty
        gcActive: false,
      })
      .then(() => {
        if (this.disposed) return pixi.destroy();
        this.pixi = pixi;
        quietPixiGlWarnings(pixi);
        pixi.resize(this.frame.width, this.frame.height, this.frame.dpr);
        // After Pixi's own listeners (added by init): it prevents the default, so the browser
        // restores the context, and rebuilds its state on restore
        canvas.addEventListener('webglcontextlost', this.onContextLost);
        canvas.addEventListener('webglcontextrestored', this.onContextRestored);
        this.invalidate();
      }, this.onError);
  }

  resize(width: number, height: number, dpr: number) {
    const { frame } = this;
    if (width === frame.width && height === frame.height && dpr === frame.dpr) return;
    frame.width = width;
    frame.height = height;
    frame.dpr = dpr;
    this.pixi?.resize(width, height, dpr);
    this.sync.resized();
    this.invalidate();
  }

  invalidate = () => {
    if (!this.disposed) this.scheduler.invalidate();
  };

  preload(src: string, width: number) {
    this.store.preload(src, width);
  }

  imageStatus(src: string): ImageStatus {
    return this.store.status(src);
  }

  subscribeImage(src: string, listener: () => void) {
    return this.store.subscribe(src, listener);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (typeof document.fonts !== 'undefined')
      document.fonts.removeEventListener('loadingdone', this.onFontsLoaded);
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.scheduler.dispose();
    this.sync.dispose();
    this.store.clear();
    for (const picture of this.pictures.bakery.clear()) picture.texture?.destroy(true);
    this.pixi?.destroy();
  }

  private onContextLost = () => {
    this.stats.contextLosses++;
    console.warn('[gl] WebGL context lost');
  };

  /**
   * A lost context takes every texture's pixels with it, and the canvas stays blank until a frame
   * draws again. Pixi re-creates its GPU state, but not our pixels: the images' bitmaps were
   * closed after upload, and baked pictures and layers only lived on the GPU. Everything is
   * dropped and painted again, as on a first load (images come from the HTTP cache).
   */
  private onContextRestored = () => {
    this.stats.contextRestores++;
    console.warn('[gl] WebGL context restored, painting everything again');
    if (this.pixi) quietPixiGlWarnings(this.pixi);
    this.store.clear();
    this.pictures.clear();
    this.fades.clear();
    this.sync.repaintAll();
    this.invalidate();
  };

  // Frame

  private draw = (time: number, budget: FrameBudget) => {
    const root = this.root;
    if (this.disposed || !root || !this.pixi) return false;
    const start = performance.now();
    const { frame, stats, store } = this;
    frame.now = time;
    frame.index++;
    stats.repaints = 0;

    store.upload(budget);
    if (this.fontsReady) {
      store.renderQueued(budget);
      this.pictures.bakeDue(budget);
    }
    const animating = stepAnimations(root, time);
    this.fades.step(time);

    const stage = this.sync.syncRoot(root);
    this.pixi.render({ container: stage });
    store.fetchWanted(node => {
      const state = this.sync.states.get(node);
      if (!state || state.x === Infinity) return null;
      // A node under a culled one keeps its last placement: placed this frame, or a picture's
      // stand-in (placed by its bake, outside the tree)
      if (state.syncedAt !== frame.index && !this.pictures.bakery.ofStandIn(node)) return null;
      return state.onScreen ? 'visible' : 'near';
    });
    this.evict();
    // Now and then: dead image entries hold no bytes, so evict() never sees them
    if (frame.index % 120 === 0) store.prune();

    this.frameFailures = 0;
    stats.frames++;
    stats.uploads = store.uploaded;
    stats.failed = store.failed;
    stats.uploadMs += budget.spent.upload;
    stats.textMs += budget.spent.text;
    stats.textures = store.entries.size;
    stats.arts = this.pictures.bakery.pictures.size;
    stats.textureBytes = store.bytes + this.pictures.bytes;
    stats.frameMs = performance.now() - start;
    return (
      animating ||
      this.sync.retrying ||
      this.fades.size > 0 ||
      store.pendingUploads > 0 ||
      (this.fontsReady && (store.pendingRenders > 0 || this.pictures.queued > 0))
    );
  };

  /** Over the budget: unused textures first, then pictures only far nodes show, LRU. */
  private evict() {
    const bytes = this.store.bytes + this.pictures.bytes;
    const budget = this.tuning.textureBudget;
    if (bytes <= budget) return;
    const candidates = [
      ...this.store.unused().map(entry => ({
        lastUsed: entry.lastUsed,
        bytes: entry.bytes,
        free: () => this.store.free(entry),
      })),
      ...this.pictures.evictable(),
    ];
    for (const candidate of pickEvictions(candidates, bytes, budget)) candidate.free();
  }
}
