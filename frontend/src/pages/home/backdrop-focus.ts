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
}

const clampUnit = (value: number) => Math.min(1, Math.max(0, value));

const formatPosition = (x: number, y: number) =>
  `${(clampUnit(x) * 100).toFixed(2)}% ${(clampUnit(y) * 100).toFixed(2)}%`;

/**
 * Returns CSS background-position percentages for a normalized image focus point.
 * Missing focus uses right center; missing or invalid dimensions use the focus directly.
 * With positive finite dimensions in pixels, positions a cover image toward the normalized
 * container target (default 0.57, 0.5), clamping to its edges and centering axes without overflow.
 * Focus and target coordinates must not be NaN; out-of-range values are clamped to [0, 1].
 */
export function getBackdropPosition(
  focus: BackdropFocus | null | undefined,
  context?: BackdropPositionContext
): string {
  if (!focus) return formatPosition(1, 0.5);

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
    return formatPosition(x, y);

  const targetX = clampUnit(context.targetX ?? 0.57);
  const targetY = clampUnit(context.targetY ?? 0.5);
  const scale = Math.max(
    context.containerWidth / context.imageWidth,
    context.containerHeight / context.imageHeight
  );
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

  return formatPosition(positionX, positionY);
}
