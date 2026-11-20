import type { GlNode } from '../core/scene';
import type { GlArt } from '../paint/painter';

/** A component's picture (GlArt) and the texture it's baked into once everything it draws is ready. */
export interface Picture<T> {
  /** The art's key, the resolution it's baked at and the font epoch. */
  key: string;
  art: GlArt;
  /** Texture px per CSS px: the device pixel ratio times the art's `scale`. */
  resolution: number;
  /** Stands in for the picture while it's drawn: the user of its images and texts. */
  standIn: GlNode;
  texture: T | null;
  bytes: number;
  /** When it was baked (frame time), for its fade in. */
  readyAt: number;
  /** Frame it was last shown. */
  lastUsed: number;
  /** Nodes showing it: repainted once it's baked. */
  users: Set<GlNode>;
}

/**
 * The pictures components show, by key: every node showing the same key shares one texture. A
 * picture waits in the queue until it's drawn whole; the backend does the drawing.
 */
export class Bakery<T> {
  readonly pictures = new Map<string, Picture<T>>();
  private queue = new Set<Picture<T>>();
  private byStandIn = new WeakMap<GlNode, Picture<T>>();

  /** Still the bakery's picture for its key (not removed, dropped or cleared since). */
  private current(picture: Picture<T>) {
    return this.pictures.get(picture.key) === picture;
  }

  constructor(private readonly createStandIn: (art: GlArt) => GlNode) {}

  /**
   * The picture for `art` at `dpr`: created and queued the first time. A new font `epoch` (fonts
   * that loaded since) makes new pictures: their text was drawn in a fallback font.
   */
  picture(art: GlArt, dpr: number, frame: number, epoch = 0): Picture<T> {
    const resolution = dpr * (art.scale ?? 1);
    const key = `${art.key}|${resolution}|${epoch}`;
    let picture = this.pictures.get(key);
    if (!picture) {
      picture = {
        key,
        art,
        resolution,
        standIn: this.createStandIn(art),
        texture: null,
        bytes: 0,
        readyAt: -Infinity,
        lastUsed: frame,
        users: new Set(),
      };
      this.pictures.set(key, picture);
      this.byStandIn.set(picture.standIn, picture);
      this.queue.add(picture);
    }
    return picture;
  }

  /** The picture a stand-in node draws, if it is one. */
  ofStandIn(node: GlNode) {
    const picture = this.byStandIn.get(node);
    return picture && this.current(picture) ? picture : undefined;
  }

  /** Draw it again (something it waits on settled). */
  requeue(picture: Picture<T>) {
    // A late notice for a picture already gone must not bring it back (or, leaving the queue
    // unused, take its replacement's key with it)
    if (this.current(picture)) this.queue.add(picture);
  }

  get queued() {
    return this.queue.size;
  }

  /**
   * Queued pictures someone shows, shown ones first. Those nobody shows leave the queue; never
   * baked, they're dropped (passed to `drop`).
   */
  due(isShown: (picture: Picture<T>) => boolean, drop: (picture: Picture<T>) => void) {
    const due: Array<{ picture: Picture<T>; shown: boolean }> = [];
    for (const picture of this.queue) {
      if (picture.users.size) {
        due.push({ picture, shown: isShown(picture) });
        continue;
      }
      this.queue.delete(picture);
      if (!picture.texture && this.current(picture)) {
        this.pictures.delete(picture.key);
        drop(picture);
      }
    }
    // Stable: equally shown ones keep their order
    return due.sort((a, b) => Number(b.shown) - Number(a.shown));
  }

  /** Out of the queue (being drawn). */
  take(picture: Picture<T>) {
    this.queue.delete(picture);
  }

  remove(picture: Picture<T>) {
    this.queue.delete(picture);
    if (this.current(picture)) this.pictures.delete(picture.key);
  }

  /** Forgets every picture, returning them (their textures are the caller's to free). */
  clear() {
    const pictures = [...this.pictures.values()];
    this.pictures.clear();
    this.queue.clear();
    return pictures;
  }
}
