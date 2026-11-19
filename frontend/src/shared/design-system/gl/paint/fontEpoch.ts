/** What FontEpoch reads of `document.fonts`. */
export interface FontSet {
  status: string;
  ready: Promise<unknown>;
  check(font: string, text?: string): boolean;
  load(font: string, text?: string): Promise<unknown>;
  addEventListener(type: 'loadingdone', listener: () => void): void;
  removeEventListener(type: 'loadingdone', listener: () => void): void;
}

/**
 * Text is rasterized once into textures, so it must not be drawn before its font is in: the
 * fallback font would stay. Text waits for the first fonts (`ready`), and each text for its own
 * face (`fontReady`: the page may not have used that weight yet). A text drawn anyway in a
 * fallback (its face failed to load) marks the set; a later font load then bumps `value`, part of
 * every text's and picture's key, and `onChange` paints everything again. `onChange` also runs
 * when the first fonts or a waited-for face are in.
 */
export class FontEpoch {
  value = 0;
  ready: boolean;
  private disposed = false;
  /** Faces asked for (font|text), and those whose load ended. */
  private loading = new Set<string>();
  private settled = new Set<string>();
  private drewFallback = false;

  constructor(
    private readonly fonts: FontSet | undefined,
    private readonly onChange: () => void
  ) {
    this.ready = !fonts || fonts.status === 'loaded';
    if (!fonts) return;
    if (!this.ready)
      void fonts.ready.then(() => {
        if (this.disposed || this.ready) return;
        this.ready = true;
        onChange();
      });
    fonts.addEventListener('loadingdone', this.loaded);
  }

  /**
   * Whether `text` can be drawn in `font` now (a canvas font string). If its face isn't loaded,
   * asks for it and returns false: `onChange` runs once it's in. A face that failed to load is
   * drawn in the fallback (true).
   */
  fontReady(font: string, text: string) {
    const { fonts } = this;
    if (!fonts || fonts.check(font, text)) return true;
    const key = `${font}|${text}`;
    if (this.settled.has(key)) {
      this.drewFallback = true;
      return true;
    }
    if (!this.loading.has(key)) {
      this.loading.add(key);
      const done = () => {
        this.loading.delete(key);
        this.settled.add(key);
        if (!this.disposed) this.onChange();
      };
      fonts.load(font, text).then(done, done);
    }
    return false;
  }

  dispose() {
    this.disposed = true;
    this.fonts?.removeEventListener('loadingdone', this.loaded);
  }

  private loaded = () => {
    if (this.disposed) return;
    if (!this.ready) {
      // The first fonts: `ready` follows
      if (this.fonts!.status !== 'loaded') return;
      this.ready = true;
      this.onChange();
      return;
    }
    if (!this.drewFallback) return;
    this.drewFallback = false;
    this.settled.clear();
    this.value++;
    this.onChange();
  };
}
