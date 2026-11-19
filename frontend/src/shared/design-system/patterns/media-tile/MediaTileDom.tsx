import { forwardRef, useState } from 'react';

import { ArtworkDom } from '../../artwork/ArtworkDom';
import { Badge } from '../../badge/Badge';
import { CollectionTileDom } from '../../collection-tile/CollectionTileDom';
import type { MediaTileProps } from './MediaTile';
import * as styles from './mediaTile.css';
import { resolveMediaTileVisual } from './mediaTileVisual';

/** MediaTile as DOM: the images as elements over the frame, falling back as they fail. */
export const MediaTileDom = forwardRef<HTMLButtonElement, MediaTileProps>(function MediaTileDom(
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
  return (
    <CollectionTileDom
      {...props}
      ref={forwardedRef}
      label={title}
      labelPlacement={labelPlacement}
      labelHidden={namesTile && labelPlacement === 'overlay'}
      ratio={ratio}
      badge={
        badge ? <Badge accessibleLabel={badge.accessibleLabel}>{badge.label}</Badge> : undefined
      }
      visual={
        <>
          <ArtworkDom
            src={titled ?? artwork}
            ratio="fill"
            fallback={<span className={styles.fallbackTitle}>{title}</span>}
            fallbackText={title}
            onError={titled ? () => setTitledFailed(titled) : undefined}
            onLoad={() => setTitledShownFor(titled ? title : null)}
            holdPrevious={Boolean(titled) && titledShown}
          />
          {shownLogo && (
            <span className={styles.logo}>
              <img
                src={shownLogo}
                alt=""
                decoding="async"
                onError={() => setLogoFailed(shownLogo)}
              />
            </span>
          )}
        </>
      }
    />
  );
});
