import type { ArtworkProps } from './Artwork';
import * as styles from './artwork.css';
import { useArtwork } from './useArtwork';
import { useImageStatus } from './useImageStatus';

/** Artwork as DOM: an <img> over the placeholder fill, the fallback in its place on failure. */
export function ArtworkDom(props: ArtworkProps) {
  const { src, alt = '', ratio = 'landscape', fit = 'cover', fallback } = props;
  const { status, imageProps } = useImageStatus(src);
  const { replacing, held, describedFallback } = useArtwork(props, {
    failed: status === 'failed',
    loaded: Boolean(src) && status === 'loaded',
  });
  return (
    <span
      className={styles.artwork}
      data-ratio={ratio}
      data-fit={fit}
      data-status={status}
      role={describedFallback ? 'img' : undefined}
      aria-label={describedFallback ? alt : undefined}
    >
      {held && (
        <img
          key={held}
          className={styles.heldImage}
          src={held}
          alt=""
          aria-hidden="true"
          draggable={false}
        />
      )}
      {src && status !== 'failed' && (
        <img
          {...imageProps}
          key={src}
          className={styles.image}
          data-instant={replacing ? '' : undefined}
          src={src}
          alt={alt}
          decoding="async"
          draggable={false}
        />
      )}
      {status === 'failed' && fallback && (
        <span className={styles.fallback} aria-hidden="true">
          {fallback}
        </span>
      )}
    </span>
  );
}
