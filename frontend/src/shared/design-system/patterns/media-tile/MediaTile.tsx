import { forwardRef, useEffect, useLayoutEffect, useState } from 'react';

import { Artwork } from '../../artwork/Artwork';
import { Badge } from '../../badge/Badge';
import { CollectionTile, type CollectionTileProps } from '../../collection-tile/CollectionTile';
import { useGlImageStatus, useGlNode, useGlPaint, useGlParent } from '../../gl';
import { drawTileLogo, mediaTileVisual } from './mediaTile.art';
import * as styles from './mediaTile.css';
import { resolveMediaTileVisual } from './mediaTileVisual';

export type MediaTileProps = Omit<
  CollectionTileProps,
  'label' | 'labelHidden' | 'visual' | 'ratio' | 'badge'
> & {
  /** The title, which names the tile. From the feature, already localized. */
  title: string;
  /** Backdrop (landscape) or poster (portrait) URL. Missing or failing, the title shows instead. */
  artwork?: string | null;
  /** `landscape` backdrops (Home rows) or `portrait` posters. */
  ratio?: 'landscape' | 'portrait';
  /**
   * The title's logo, drawn over a landscape backdrop. Decorative: the title names the tile, and
   * over the artwork (`labelPlacement="overlay"`) the logo stands in for the visible title.
   */
  logo?: string | null;
  /**
   * A landscape backdrop with the title already drawn in (the logo, or the name): preferred over
   * `artwork` and `logo`, since one image paints faster than two layers. Over the artwork it stands
   * in for the visible title, once it has shown: until then the title stays visible, and a newer
   * version keeps the previous one in view while it loads. If it fails to load, the tile shows
   * `artwork` and `logo` instead.
   */
  titledArtwork?: string | null;
  /** A short quality or availability label ("4K", "New"), top start corner. */
  badge?: { label: string; accessibleLabel?: string };
};

/**
 * A movie or show in a collection: Home rows, Search results, related media. The same tile
 * everywhere; features adapt their media data into these props (formatted text, image URLs), and
 * the collection around it owns movement. Supporting text, progress and the badge describe it.
 */
export const MediaTile = forwardRef<HTMLButtonElement, MediaTileProps>(function MediaTile(
  { title, artwork, ratio = 'landscape', logo, titledArtwork, badge, labelPlacement, ...props },
  forwardedRef
) {
  const [logoFailed, setLogoFailed] = useState<string | null>(null);
  const [titledFailed, setTitledFailed] = useState<string | null>(null);
  // The title drawn in the last image to load in this tile, if it had one. A newer version of it
  // keeps it in view while loading (see holdPrevious), so the label stays hidden; over a plain
  // backdrop, or once the tile shows another title (a carousel slot reused), the label shows and
  // nothing is held.
  const [titledShownFor, setTitledShownFor] = useState<string | null>(null);
  const titledShown = titledShownFor === title;
  // The same fallbacks as the picture, from what this tile saw load and fail
  const {
    titled,
    logo: shownLogo,
    namesTile,
  } = resolveMediaTileVisual({ title, artwork, ratio, logo, titledArtwork }, src => {
    if (src === titledArtwork)
      return titledFailed === src ? 'failed' : titledShown ? 'ready' : 'loading';
    return logoFailed === src ? 'failed' : 'ready';
  });
  // Inside a GlSurface the whole tile is one baked picture (mediaTile.art.ts)
  const glVisual = useGlParent()
    ? mediaTileVisual({ title, artwork, ratio, logo, titledArtwork })
    : undefined;
  return (
    <CollectionTile
      {...props}
      ref={forwardedRef}
      glVisual={glVisual}
      label={title}
      labelPlacement={labelPlacement}
      // In GL the visual says whether it names the tile (it knows what failed or is still loading)
      labelHidden={!glVisual && namesTile && labelPlacement === 'overlay'}
      ratio={ratio}
      badge={
        badge ? <Badge accessibleLabel={badge.accessibleLabel}>{badge.label}</Badge> : undefined
      }
      visual={
        <>
          <Artwork
            src={titled ?? artwork}
            ratio="fill"
            fallback={<span className={styles.fallbackTitle}>{title}</span>}
            fallbackText={title}
            onError={titled ? () => setTitledFailed(titled) : undefined}
            onLoad={() => setTitledShownFor(titled ? title : null)}
            holdPrevious={Boolean(titled) && titledShown}
          />
          {shownLogo && <TileLogo src={shownLogo} onError={() => setLogoFailed(shownLogo)} />}
        </>
      }
    />
  );
});

/** The title logo over the backdrop: an <img>, or a GL image inside a GlSurface. */
function TileLogo({ src, onError }: { src: string; onError: () => void }) {
  const glParent = useGlParent();
  const node = useGlNode();
  const status = useGlImageStatus(src);
  useEffect(() => {
    if (status === 'failed') onError();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);
  const width = glParent?.width ?? 0;
  const height = glParent?.height ?? 0;
  useLayoutEffect(() => {
    node?.set({ z: 1 });
  });
  useGlPaint(node, painter => drawTileLogo(painter, src, width, height), [src, width, height]);
  if (glParent) return null;
  return (
    <span className={styles.logo}>
      <img src={src} alt="" decoding="async" onError={onError} />
    </span>
  );
}
