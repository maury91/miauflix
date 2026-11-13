/**
 * Whether the artwork worker may download `urlText`: TMDB's 300px renditions only, PNG for logos
 * (they need transparency) and PNG or JPEG for backdrops. Anything else, such as TMDB's SVG logos,
 * can never be analyzed, so it is not worth retrying.
 */
export function isAnalyzableArtworkUrl(urlText: string, allowJpeg = true): boolean {
  let url: URL;
  try {
    url = new URL(urlText);
  } catch {
    return false;
  }
  return (
    url.protocol === 'https:' &&
    url.hostname === 'image.tmdb.org' &&
    !url.port &&
    url.pathname.startsWith('/t/p/w300/') &&
    (allowJpeg ? /\.(?:png|jpe?g)$/iu : /\.png$/iu).test(url.pathname)
  );
}
