import type { Rgba } from '../core/color';
import type { GlArt, ImageStatus, Painter, TextSpec } from './painter';

type Options = Record<string, number | string | undefined>;

/** One Painter call, as recorded (numbers rounded to 0.01 px). */
export type DrawCall =
  | { op: 'rect'; box: number[]; color: string; options?: Options }
  | { op: 'gradient'; box: number[]; from: string; to: string; axis: 'x' | 'y'; options?: Options }
  | { op: 'image'; src: string; box: number[]; status: ImageStatus; options?: Options }
  | { op: 'text'; text: string; at: number[]; spec: Options; options?: Options }
  | { op: 'load'; src: string; width: number; status: ImageStatus }
  | { op: 'art'; key: string; size: number[] }
  | { op: 'canvas'; key: string; box: number[] };

export interface RecordingPainterOptions {
  /** An image's status (default: ready). */
  image?(src: string): ImageStatus;
  /** A text's drawn size (default: 0.5 × size per character, one line); null while loading. */
  measure?(spec: TextSpec): { width: number; height: number } | null;
}

const round = (value: number) => Math.round(value * 100) / 100;
const rgba = ([r, g, b, a]: Rgba) =>
  `rgba(${round(r * 255)}, ${round(g * 255)}, ${round(b * 255)}, ${round(a)})`;
const clean = (options?: object): Options | undefined => {
  if (!options) return undefined;
  const entries = Object.entries(options).filter(([, value]) => value !== undefined);
  if (!entries.length) return undefined;
  return Object.fromEntries(
    entries.map(([key, value]) => [key, typeof value === 'number' ? round(value) : value])
  );
};

/**
 * A Painter that records its calls instead of drawing: pictures' tests snapshot what each variant
 * draws, with the image statuses and text sizes the test chooses.
 */
export class RecordingPainter implements Painter {
  readonly calls: DrawCall[] = [];
  private readonly options: RecordingPainterOptions;

  constructor(options: RecordingPainterOptions = {}) {
    this.options = options;
  }

  /** Records `art`'s drawing (not its placeholder). */
  static record(art: GlArt, options?: RecordingPainterOptions): DrawCall[] {
    const painter = new RecordingPainter(options);
    art.draw(painter);
    return painter.calls;
  }

  rect(x: number, y: number, w: number, h: number, color: Rgba, options?: object) {
    this.calls.push({
      op: 'rect',
      box: [x, y, w, h].map(round),
      color: rgba(color),
      options: clean(options),
    });
  }

  gradient(
    x: number,
    y: number,
    w: number,
    h: number,
    from: Rgba,
    to: Rgba,
    axis: 'x' | 'y',
    options?: object
  ) {
    this.calls.push({
      op: 'gradient',
      box: [x, y, w, h].map(round),
      from: rgba(from),
      to: rgba(to),
      axis,
      options: clean(options),
    });
  }

  image(src: string, x: number, y: number, w: number, h: number, options?: object): ImageStatus {
    const status = this.status(src);
    this.calls.push({
      op: 'image',
      src,
      box: [x, y, w, h].map(round),
      status,
      options: clean(options),
    });
    return status;
  }

  text(spec: TextSpec, x: number, y: number, options?: object) {
    const size = this.measure(spec);
    if (size)
      this.calls.push({
        op: 'text',
        text: spec.text,
        at: [x, y].map(round),
        spec: clean({ ...spec, text: undefined })!,
        options: clean(options),
      });
    return size;
  }

  measure(spec: TextSpec) {
    if (this.options.measure) return this.options.measure(spec);
    return {
      width: round(spec.text.length * spec.size * 0.5),
      height: round(spec.size * spec.lineHeight),
    };
  }

  load(src: string, width: number): ImageStatus {
    const status = this.status(src);
    this.calls.push({ op: 'load', src, width: round(width), status });
    return status;
  }

  art(art: GlArt) {
    this.calls.push({ op: 'art', key: art.key, size: [art.width, art.height].map(round) });
    return true;
  }

  canvas(
    key: string,
    _width: number,
    _height: number,
    _draw: unknown,
    x: number,
    y: number,
    w: number,
    h: number
  ) {
    this.calls.push({ op: 'canvas', key, box: [x, y, w, h].map(round) });
    return true;
  }

  private status(src: string): ImageStatus {
    return this.options.image?.(src) ?? 'ready';
  }
}
