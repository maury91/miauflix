/**
 * What pictures (`*.art.ts`) and metrics may use from the GL engine: no React, Pixi or DOM, so they
 * run in unit tests and can be drawn by any Painter.
 */
export { hex, type Rgba } from './core/color';
export { remPx } from './core/units';
export { artKey, type ArtProps } from './paint/artKey';
export type { GlArt, ImageStatus, Painter, TextSpec } from './paint/painter';
