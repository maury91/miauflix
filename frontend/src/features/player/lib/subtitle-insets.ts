export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The picture's box fitted between the insets: the same aspect ratio, as large as fits,
 * centred in the free space. Unchanged when the controls do not overlap the picture.
 */
export function fitBetweenInsets(
  box: Box,
  containerHeight: number,
  top: number,
  bottom: number
): Box {
  const freeTop = Math.max(0, top);
  const freeBottom = containerHeight - Math.max(0, bottom);
  if (box.y >= freeTop && box.y + box.height <= freeBottom) return box;
  const available = freeBottom - freeTop;
  if (available <= 0 || box.height <= 0) return box;
  const scale = Math.min(1, available / box.height);
  const width = box.width * scale;
  const height = box.height * scale;
  return {
    x: box.x + (box.width - width) / 2,
    // Stay as close to where the picture is as the free space allows.
    y: Math.min(Math.max(box.y + (box.height - height) / 2, freeTop), freeBottom - height),
    width,
    height,
  };
}
