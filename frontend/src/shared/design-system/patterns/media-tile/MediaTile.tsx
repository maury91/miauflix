import { forwardRef, useState } from 'react';

import { Artwork } from '../../artwork/Artwork';
import { Badge } from '../../badge/Badge';
import { CollectionTile, type CollectionTileProps } from '../../collection-tile/CollectionTile';
import * as styles from './mediaTile.css';

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
   * in for the visible title. If it fails to load, the tile shows `artwork` and `logo` instead.
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
  const titled =
    ratio === 'landscape' && titledArtwork && titledFailed !== titledArtwork ? titledArtwork : null;
  const showLogo = !titled && ratio === 'landscape' && logo && logoFailed !== logo;
  return (
    <CollectionTile
      {...props}
      ref={forwardedRef}
      label={title}
      labelPlacement={labelPlacement}
      labelHidden={Boolean(titled || showLogo) && labelPlacement === 'overlay'}
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
            onError={titled ? () => setTitledFailed(titled) : undefined}
          />
          {showLogo && (
            <span className={styles.logo}>
              <img src={logo} alt="" decoding="async" onError={() => setLogoFailed(logo)} />
            </span>
          )}
        </>
      }
    />
  );
});
