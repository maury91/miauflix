import { SourcePreparationStatus } from '@features/preload/ui/SourcePreparationStatus';
import type { MediaDto } from '@miauflix/backend';
import { builtForTizen } from '@shared/config/constants';
import { type BackdropPositionContext, getBackdropPlacement } from '@shared/lib/backdrop-focus';
import { artworkUrl } from '@shared/lib/media.utils';
import {
  type ComponentProps,
  type FC,
  Fragment,
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  BACKDROP_OVERLAP_RATIO,
  getHeroBackdropLayout,
  getHeroTextGeometry,
} from '../hero-backdrop-layout';
import { heroDetailsModel } from './heroDetailsModel';
import { HERO_SHADE } from './heroShade.metrics';
import { HERO_DETAILS, heroTypeScale } from './heroType';
import * as styles from './mediaHeroDom.css';
import { type BackdropLayerState, type MediaHeroProps, useMediaHero } from './useMediaHero';

import StarIcon from '~icons/mdi/star';

/**
 * The hero's geometry in pixels, for the window it is in: the details' width, the backdrop's left
 * edge, the logo's box, the type sizes and the shade's gradients. Inline, in final values: the TV
 * build cannot resolve `clamp()`/`min()`, and Chromium 69 re-resolves `var()`/`calc()` in a
 * gradient on every restyle (it repainted the whole shade, about 480 ms, each time).
 */
type HeroGeometry = ReturnType<typeof getHeroTextGeometry>;
const px = (value: number) => `${Math.round(value * 100) / 100}px`;
const percent = (share: number) => `${Math.round(share * 1e4) / 100}%`;
/** "text right + `fromFree` of the free width", in px. */
const shadeAt = (geometry: HeroGeometry, fromFree: number) =>
  px(geometry.textRight + fromFree * geometry.freeWidth);
const stops = (list: ReadonlyArray<readonly [number, string]>) =>
  list.map(([at, fill]) => `${fill} ${percent(at)}`).join(', ');
const { radial, side, band } = HERO_SHADE;

function heroStyles(windowWidth: number, windowHeight: number, margin: number) {
  const geometry = getHeroTextGeometry(windowWidth, margin);
  const backdropLeft = geometry.detailsLeft + geometry.detailsWidth * BACKDROP_OVERLAP_RATIO;
  const type = heroTypeScale(windowHeight);
  return {
    shade: {
      backgroundImage: [
        `radial-gradient(ellipse ${percent(radial.radiusX)} ${percent(radial.radiusY)} at ${shadeAt(geometry, radial.centerFree)} 0%, ${stops(radial.stops)})`,
        `linear-gradient(90deg, ${side.color} 0%, ${side.color} ${px(backdropLeft)}, ${side.edgeFadeColor} ${px(geometry.detailsLeft + geometry.detailsWidth * (BACKDROP_OVERLAP_RATIO + side.edgeFade))}, ${side.midColor} ${shadeAt(geometry, side.midFree)}, transparent ${shadeAt(geometry, side.endFree)})`,
        `linear-gradient(0deg, ${stops(HERO_SHADE.bottom)})`,
      ].join(', '),
    },
    band: {
      left: shadeAt(geometry, band.leftFree),
      backgroundImage: `linear-gradient(181deg, ${stops(band.stops)})`,
    },
    backdropLeft: px(backdropLeft),
    details: { width: px(geometry.detailsWidth) },
    logo: {
      maxWidth: px(
        Math.min((windowWidth * HERO_DETAILS.logoWidthVw) / 100, HERO_DETAILS.logoMaxWidth)
      ),
    },
    title: { fontSize: px(type.title) },
    metadata: { fontSize: px(type.metadata) },
    overview: { fontSize: px(type.overview) },
  };
}
type HeroStyles = ReturnType<typeof heroStyles>;

/** The window's size, following resizes. */
function useWindowSize() {
  const read = () => ({ width: window.innerWidth, height: window.innerHeight });
  const [size, setSize] = useState(read);
  useEffect(() => {
    const onResize = () => setSize(read());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

/** On their own layers the TV paints the gradients and backdrops once, not every frame. */
const layerClass = (base: string, tv: string) => (builtForTizen ? `${base} ${tv}` : base);

/**
 * MediaHero as DOM: the details over stacked backdrop layers that crossfade (CSS transitions),
 * under the shade's gradients. Null media renders an empty hero.
 */
export const MediaHeroDom: FC<MediaHeroProps> = props => {
  const hero = useMediaHero(props, null);
  const { detailsMedia, moving, detailsLogo, layers, settle, margin, preparation, availability } =
    hero;
  const heroRef = useRef<HTMLElement>(null);
  const [heroSize, setHeroSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return undefined;

    const updateSize = () =>
      setHeroSize({
        width: hero.clientWidth,
        height: hero.clientHeight,
      });
    updateSize();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(updateSize);
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);

  const layout = getHeroBackdropLayout(heroSize.width, margin);
  // The hero spans the window
  const windowSize = useWindowSize();
  const inline = useMemo(
    () => heroStyles(windowSize.width, windowSize.height, margin),
    [windowSize.width, windowSize.height, margin]
  );
  const placementFor = (layer: BackdropLayerState) => {
    const context: BackdropPositionContext = {
      imageWidth: layer.imageWidth,
      imageHeight: layer.imageHeight,
      containerWidth: layout?.width ?? 0,
      containerHeight: heroSize.height,
      targetX: layout?.targetX,
      targetY: layout?.targetY,
      maxZoom: 1.5,
    };
    const placement = getBackdropPlacement(layer.focus, context);
    return { backgroundPosition: placement.position, backgroundSize: placement.size };
  };

  const shading = (
    <>
      <div
        className={layerClass(styles.shade, styles.tvLayer)}
        style={inline.shade}
        aria-hidden="true"
      />
      <div
        className={layerClass(styles.band, styles.tvLayer)}
        style={inline.band}
        aria-hidden="true"
      />
    </>
  );
  if (!props.media)
    return (
      <header ref={heroRef} className={styles.hero} aria-hidden="true">
        {shading}
      </header>
    );
  return (
    <header ref={heroRef} className={styles.hero} aria-live="polite">
      {shading}
      {layers.map(layer => (
        <div
          key={layer.id}
          className={layerClass(styles.backdropLayer, styles.tvOpacityLayer)}
          style={{
            left: inline.backdropLeft,
            ...placementFor(layer.backdrop),
            backgroundImage: layer.backdrop.url
              ? `url(${JSON.stringify(layer.backdrop.url)})`
              : 'none',
            opacity: layer.visible ? 1 : 0,
          }}
          onTransitionEnd={() => settle(layer.id)}
          aria-hidden="true"
        />
      ))}
      {detailsMedia && (
        <HeroDetails
          media={detailsMedia}
          heroLogo={detailsLogo.heroLogo}
          preparation={preparation}
          availability={availability}
          hidden={moving}
          inline={inline}
        />
      )}
    </header>
  );
};

const MetadataDot = () => <span className={styles.metadataDot} aria-hidden="true" />;

/**
 * The title, metadata and overview (heroDetailsModel). Memoized: each move swaps the backdrop
 * layers three times (added, faded in, settled), and none of those changes the text.
 */
const HeroDetails = memo(function HeroDetails({
  media,
  heroLogo,
  preparation,
  availability,
  hidden,
  inline,
}: {
  hidden: boolean;
  inline: HeroStyles;
  media: MediaDto;
  heroLogo: string | null | undefined;
  preparation: ComponentProps<typeof SourcePreparationStatus>['preparation'];
  availability: ComponentProps<typeof SourcePreparationStatus>['availability'];
}) {
  const details = heroDetailsModel(media);
  return (
    <div className={styles.details} style={{ ...inline.details, opacity: hidden ? 0 : 1 }}>
      {heroLogo ? (
        <img
          className={styles.logo}
          style={inline.logo}
          decoding="async"
          src={artworkUrl(heroLogo, 'logo', 500)}
          alt={details.title}
        />
      ) : (
        <h1 className={styles.title} style={inline.title}>
          {details.title}
        </h1>
      )}
      <div className={styles.metadataRow}>
        <div className={styles.metadataBlock}>
          <div className={styles.metadata} style={inline.metadata}>
            {details.metadata.map((text, index) => (
              <Fragment key={index}>
                {index > 0 && <MetadataDot />}
                <span>{text}</span>
              </Fragment>
            ))}
            {details.rating && (
              <>
                {details.metadata.length > 0 && <MetadataDot />}
                <span className={styles.rating}>
                  <StarIcon aria-hidden="true" />
                  {details.rating}
                </span>
              </>
            )}
            <span className={styles.badgeGap} />
            <SourcePreparationStatus
              mediaKind={media._type}
              mode="browse"
              preparation={preparation}
              availability={availability}
            />
          </div>
          {details.genres && (
            <div className={styles.metadata} style={inline.metadata}>
              {details.genres}
            </div>
          )}
        </div>
      </div>
      <p className={styles.overview} style={inline.overview}>
        {details.overview}
      </p>
    </div>
  );
});
