import { forwardRef, useState } from 'react';

import { Artwork } from '../../artwork/Artwork';
import { Badge } from '../../badge/Badge';
import { CollectionTile, type CollectionTileProps } from '../../collection-tile/CollectionTile';
import * as styles from './mediaTile.css';

export type MediaTileProps = Omit<CollectionTileProps, 'label' | 'visual' | 'ratio' | 'badge'> & {
  /** The title, which names the tile. From the feature, already localized. */
  title: string;
  /** Backdrop (landscape) or poster (portrait) URL. Missing or failing, the title shows instead. */
  artwork?: string | null;
  /** `landscape` backdrops (Home rows) or `portrait` posters. */
  ratio?: 'landscape' | 'portrait';
  /** The title's logo, drawn over a landscape backdrop. Decorative: the title names the tile. */
  logo?: string | null;
  /** A short quality or availability label ("4K", "New"), top start corner. */
  badge?: { label: string; accessibleLabel?: string };
};

/**
 * A movie or show in a collection: Home rows, Search results, related media. The same tile
 * everywhere; features adapt their media data into these props (formatted text, image URLs), and
 * the collection around it owns movement. Supporting text, progress and the badge describe it.
 */
export const MediaTile = forwardRef<HTMLButtonElement, MediaTileProps>(function MediaTile(
  { title, artwork, ratio = 'landscape', logo, badge, ...props },
  forwardedRef
) {
  const [logoFailed, setLogoFailed] = useState<string | null>(null);
  const showLogo = ratio === 'landscape' && logo && logoFailed !== logo;
  return (
    <CollectionTile
      {...props}
      ref={forwardedRef}
      label={title}
      ratio={ratio}
      badge={
        badge ? <Badge accessibleLabel={badge.accessibleLabel}>{badge.label}</Badge> : undefined
      }
      visual={
        <>
          <Artwork
            src={artwork}
            ratio="fill"
            fallback={<span className={styles.fallbackTitle}>{title}</span>}
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
