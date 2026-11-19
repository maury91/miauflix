import type { TextSpec } from './painter';
import { wrapText } from './textLayout';

/** A TextSpec's cache key: the same key, the same pixels. */
export function textKey(spec: TextSpec) {
  return `text:${spec.text}|${spec.size}|${spec.weight}|${spec.lineHeight}|${spec.color}|${spec.maxWidth}|${spec.maxLines ?? 1}|${spec.align ?? 'left'}|${spec.shadow ? 1 : 0}`;
}

/** The canvas font a TextSpec is drawn in. */
export function textFont(spec: TextSpec) {
  return `${spec.weight} ${spec.size}px Poppins, sans-serif`;
}

/**
 * Text drawn with canvas 2D into `canvas` (resized to fit): wrapped to `maxLines`, lines too wide
 * ellipsized, with a little padding (more with a shadow). `resolution`: canvas px per CSS px (the
 * layout is in CSS px, so it wraps the same at any resolution).
 */
export function rasterizeText(spec: TextSpec, canvas: HTMLCanvasElement, resolution = 1) {
  const context = canvas.getContext('2d')!;
  const font = textFont(spec);
  context.font = font;
  const measure = (text: string) => context.measureText(text).width;
  const lines = wrapText(measure, spec.text, spec.maxWidth, spec.maxLines ?? 1);
  const lineHeight = Math.ceil(spec.size * spec.lineHeight);
  const pad = spec.shadow ? 4 : 1;
  const width = Math.ceil(Math.min(spec.maxWidth, Math.max(1, ...lines.map(measure))));
  canvas.width = Math.ceil((width + pad * 2) * resolution);
  canvas.height = Math.ceil((lineHeight * lines.length + pad * 2) * resolution);
  // Resizing resets the context
  context.setTransform(resolution, 0, 0, resolution, 0, 0);
  context.font = font;
  context.textBaseline = 'middle';
  context.fillStyle = spec.color;
  context.textAlign = spec.align === 'center' ? 'center' : 'left';
  if (spec.shadow) {
    context.shadowColor = 'rgba(0,0,0,0.6)';
    // Not scaled by the transform
    context.shadowBlur = 3 * resolution;
  }
  const x = spec.align === 'center' ? pad + width / 2 : pad;
  lines.forEach((line, index) => context.fillText(line, x, pad + lineHeight * (index + 0.5)));
  return canvas;
}
