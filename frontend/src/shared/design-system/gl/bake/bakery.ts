import type { GlNode } from '../core/scene';
import type { GlArt } from '../paint/painter';

/** A component's picture (GlArt) and the texture it's baked into once everything it draws is ready. */
export interface Picture<T> {
  /** The art's key and the device pixel ratio it's baked at. */
  key: string;
  art: GlArt;
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

  constructor(private readonly createStandIn: (art: GlArt) => GlNode) {}

  /** The picture for `art` at `dpr`: created and queued the first time. */
  picture(art: GlArt, dpr: number, frame: number): Picture<T> {
    const key = `${art.key}|${dpr}`;
    let picture = this.pictures.get(key);
    if (!picture) {
      picture = {
        key,
        art,
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
    return this.byStandIn.get(node);
  }

  /** Draw it again (something it waits on settled). */
  requeue(picture: Picture<T>) {
    this.queue.add(picture);
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
      if (!picture.texture) {
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
    this.pictures.delete(picture.key);
  }

  /** Forgets every picture, returning them (their textures are the caller's to free). */
  clear() {
    const pictures = [...this.pictures.values()];
    this.pictures.clear();
    this.queue.clear();
    return pictures;
  }
}
