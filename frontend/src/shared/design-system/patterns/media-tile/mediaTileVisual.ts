import type { ImageStatus } from '../../gl/art';

export interface MediaTileVisualProps {
  title: string;
  artwork?: string | null;
  ratio?: 'landscape' | 'portrait';
  logo?: string | null;
  titledArtwork?: string | null;
}

/** Which of a MediaTile's images show, and whether they show its title. */
export interface MediaTileVisual {
  /** The titled backdrop, shown alone. */
  titled: string | null;
  /** Otherwise: the artwork (the title as text when it's missing or fails)… */
  artwork: string | null;
  /** …and the logo over it. */
  logo: string | null;
  /** The images show the title: over the artwork, the label is hidden. */
  namesTile: boolean;
}

/**
 * MediaTile's fallbacks, for the DOM tile and the picture alike: the titled backdrop (landscape);
 * failing, the artwork with the logo over it; the logo failing too, the label shows. A titled
 * backdrop names the tile only once it has shown (the label stays while it loads); a loading logo
 * counts as shown. `status` is asked only about the images the answer depends on, in that order.
 */
export function resolveMediaTileVisual(
  { artwork, ratio = 'landscape', logo, titledArtwork }: MediaTileVisualProps,
  status: (src: string) => ImageStatus
): MediaTileVisual {
  const landscape = ratio === 'landscape';
  if (landscape && titledArtwork) {
    const titled = status(titledArtwork);
    if (titled !== 'failed')
      return { titled: titledArtwork, artwork: null, logo: null, namesTile: titled === 'ready' };
  }
  const shownLogo = landscape && logo && status(logo) !== 'failed' ? logo : null;
  return { titled: null, artwork: artwork ?? null, logo: shownLogo, namesTile: Boolean(shownLogo) };
}
