export interface BackdropFocus {
  x: number;
  y: number;
}

export interface BackdropPositionContext {
  imageWidth: number;
  imageHeight: number;
  containerWidth: number;
  containerHeight: number;
  targetX?: number;
  targetY?: number;
  /** Maximum scale relative to cover; defaults to no extra zoom. */
  maxZoom?: number;
}

const clampUnit = (value: number) => Math.min(1, Math.max(0, value));

const formatPosition = (x: number, y: number) =>
  `${(clampUnit(x) * 100).toFixed(2)}% ${(clampUnit(y) * 100).toFixed(2)}%`;

/**
 * Returns CSS background position and size for a normalized image focus point.
 * Missing focus uses right center; missing or invalid dimensions use the focus directly.
 * With positive finite dimensions in pixels, positions a cover image toward the normalized
 * container target (default 0.57, 0.5), clamping to its edges and centering axes without overflow.
 * Extra zoom is the minimum needed to reach the target, bounded by maxZoom.
 * Focus and target coordinates must not be NaN; out-of-range values are clamped to [0, 1].
 */
export function getBackdropPlacement(
  focus: BackdropFocus | null | undefined,
  context?: BackdropPositionContext
): { position: string; size: string } {
  if (!focus) return { position: formatPosition(1, 0.5), size: 'cover' };

  const x = clampUnit(focus.x);
  const y = clampUnit(focus.y);
  if (
    !context ||
    !Number.isFinite(context.imageWidth) ||
    !Number.isFinite(context.imageHeight) ||
    !Number.isFinite(context.containerWidth) ||
    !Number.isFinite(context.containerHeight) ||
    context.imageWidth <= 0 ||
    context.imageHeight <= 0 ||
    context.containerWidth <= 0 ||
    context.containerHeight <= 0
  )
    return { position: formatPosition(x, y), size: 'cover' };

  const targetX = clampUnit(context.targetX ?? 0.57);
  const targetY = clampUnit(context.targetY ?? 0.5);
  const coverScale = Math.max(
    context.containerWidth / context.imageWidth,
    context.containerHeight / context.imageHeight
  );
  // Both sides of the focus must cover their respective sides of the target.
  // Zero-distance edge focuses cannot reach an interior target at any finite scale.
  const requiredExtent = (targetDistance: number, sourceDistance: number) =>
    sourceDistance > 0 ? targetDistance / sourceDistance : targetDistance > 0 ? Infinity : 0;
  const requiredScale = Math.max(
    requiredExtent(targetX * context.containerWidth, x * context.imageWidth),
    requiredExtent((1 - targetX) * context.containerWidth, (1 - x) * context.imageWidth),
    requiredExtent(targetY * context.containerHeight, y * context.imageHeight),
    requiredExtent((1 - targetY) * context.containerHeight, (1 - y) * context.imageHeight)
  );
  const maxZoom = Number.isFinite(context.maxZoom) ? Math.max(1, context.maxZoom!) : 1;
  const scale = Math.min(coverScale * maxZoom, Math.max(coverScale, requiredScale));
  const renderedWidth = context.imageWidth * scale;
  const renderedHeight = context.imageHeight * scale;
  const positionX =
    renderedWidth > context.containerWidth
      ? (x * renderedWidth - targetX * context.containerWidth) /
        (renderedWidth - context.containerWidth)
      : 0.5;
  const positionY =
    renderedHeight > context.containerHeight
      ? (y * renderedHeight - targetY * context.containerHeight) /
        (renderedHeight - context.containerHeight)
      : 0.5;

  return {
    position: formatPosition(positionX, positionY),
    size: `${renderedWidth}px ${renderedHeight}px`,
  };
}

/** Cover positioning without extra zoom unless explicitly supplied in the context. */
export function getBackdropPosition(
  focus: BackdropFocus | null | undefined,
  context?: BackdropPositionContext
): string {
  return getBackdropPlacement(focus, context).position;
}
