/** An SVG path of the outline, scaled to fit a 100×100 box and centred in it (y down). */
export function outlinePath(points: [number, number][]): string {
  if (!points.length) return '';
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxY = Math.max(...ys);
  const width = Math.max(...xs) - minX;
  const height = maxY - Math.min(...ys);
  const size = Math.max(width, height) || 1;
  // The longer side spans 90 units; the shorter is centred along its own axis.
  const offsetX = 5 + ((size - width) / size) * 45;
  const offsetY = 5 + ((size - height) / size) * 45;
  return (
    points
      .map(
        ([x, y], index) =>
          `${index ? 'L' : 'M'}${(((x - minX) / size) * 90 + offsetX).toFixed(1)} ${(((maxY - y) / size) * 90 + offsetY).toFixed(1)}`
      )
      .join(' ') + 'Z'
  );
}
