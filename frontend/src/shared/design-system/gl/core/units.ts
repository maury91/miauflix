let rootPx: number | undefined;

/** A token's rem value in px, at the page's root font size (read once: density is static). */
export function remPx(value: string): number {
  if (rootPx === undefined) {
    rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  }
  return parseFloat(value) * (value.endsWith('rem') ? rootPx : 1);
}
