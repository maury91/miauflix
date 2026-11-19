import { SourcePreparationStatus } from '@features/preload/ui/SourcePreparationStatus';
import type { MediaDto } from '@miauflix/backend';
import { builtForTizen } from '@shared/config/constants';
import { PALETTE } from '@shared/config/constants';
import { type BackdropPositionContext, getBackdropPlacement } from '@shared/lib/backdrop-focus';
import { artworkUrl } from '@shared/lib/media.utils';
import { MetadataDot, MetadataRating } from '@shared/ui/metadata/metadata.styles';
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
import styled from 'styled-components';

import {
  BACKDROP_OVERLAP_RATIO,
  getHeroBackdropLayout,
  getHeroTextGeometry,
  HERO_BACKDROP_LEFT_CSS,
  HERO_DETAILS_LEFT_CSS,
  HERO_DETAILS_WIDTH_CSS,
} from '../hero-backdrop-layout';
import { HOME_VH } from '../homeLayout';
import { heroDetailsModel } from './heroDetailsModel';
import { BACKDROP_FADE_MS, DETAILS_FADE_MS } from './heroMotion';
import { HERO_SHADE } from './heroShade.metrics';
import { HERO_DETAILS, HERO_TYPE, heroTypeCss } from './heroType';
import { type BackdropLayerState, type MediaHeroProps, useMediaHero } from './useMediaHero';

import StarIcon from '~icons/mdi/star';

// The TV rasterizes in software: on their own layers the gradients and backdrops are painted once,
// instead of with every title change and every frame of a crossfade.
const tvLayer = (property: 'opacity' | 'transform') =>
  builtForTizen ? `will-change: ${property};` : '';

/**
 * The shade's geometry in pixels, on the TV. Chromium 69 resolves `var()` and `calc()` in a
 * gradient into new values on every restyle, and every rule styled-components inserts restyles
 * the page, so it repainted the whole shade (about 480 ms) each time; fixed values compare equal.
 */
type HeroShade = ReturnType<typeof getHeroTextGeometry>;
const px = (value: number) => `${Math.round(value * 100) / 100}px`;
const percent = (share: number) => `${Math.round(share * 1e4) / 100}%`;
/** "text right + `fromFree` of the free width", in px on the TV, as CSS elsewhere. */
const shadeAt = (shade: HeroShade | null, fromFree: number) =>
  shade
    ? px(shade.textRight + fromFree * shade.freeWidth)
    : `calc(var(--hero-text-right) + var(--hero-free-width) * ${fromFree})`;
const stops = (list: ReadonlyArray<readonly [number, string]>) =>
  list.map(([at, fill]) => `${fill} ${percent(at)}`).join(', ');
const { radial, side, band } = HERO_SHADE;

const Hero = styled.header<{ $shade: HeroShade | null }>`
  --hero-details-width: ${HERO_DETAILS_WIDTH_CSS};
  --hero-text-right: calc(${HERO_DETAILS_LEFT_CSS} + var(--hero-details-width));
  --hero-free-width: calc(100vw - var(--hero-text-right));
  position: absolute;
  inset: 0 0 auto;
  z-index: 1;
  height: ${HOME_VH.heroHeight}vh;
  padding: ${HOME_VH.heroPaddingTop}vh 5vw ${HOME_VH.heroPaddingBottom}vh ${HERO_DETAILS_LEFT_CSS};
  display: flex;
  align-items: flex-end;
  overflow: hidden;
  background: #000;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 2;
    pointer-events: none;
    ${tvLayer('transform')}
    background:
      radial-gradient(
        ellipse ${percent(radial.radiusX)} ${percent(radial.radiusY)} at
          ${({ $shade }) => shadeAt($shade, radial.centerFree)} 0%,
        ${stops(radial.stops)}
      ),
      linear-gradient(
        90deg,
        ${side.color} 0%,
        /* Opaque up to the backdrop left edge, so its edge never shows */
        ${side.color}
          ${({ $shade }) =>
      $shade
        ? px($shade.detailsLeft + $shade.detailsWidth * BACKDROP_OVERLAP_RATIO)
        : HERO_BACKDROP_LEFT_CSS},
        ${side.edgeFadeColor}
          ${({ $shade }) =>
      $shade
        ? px($shade.detailsLeft + $shade.detailsWidth * (BACKDROP_OVERLAP_RATIO + side.edgeFade))
        : `calc(${HERO_BACKDROP_LEFT_CSS} + var(--hero-details-width) * ${side.edgeFade})`},
        ${side.midColor} ${({ $shade }) => shadeAt($shade, side.midFree)},
        transparent ${({ $shade }) => shadeAt($shade, side.endFree)}
      ),
      linear-gradient(0deg, ${stops(HERO_SHADE.bottom)});
  }

  &::after {
    content: '';
    position: absolute;
    top: ${band.topVh}vh;
    left: ${({ $shade }) => shadeAt($shade, band.leftFree)};
    right: 0;
    height: ${band.heightVh}vh;
    z-index: 3;
    pointer-events: none;
    ${tvLayer('transform')}
    background: linear-gradient(181deg, ${stops(band.stops)});
  }
`;

/**
 * Stacked in DOM order: a later layer fades in over the earlier ones. The image and opacity are
 * inline: as styled-components props every backdrop added a CSS class, and each inserted rule
 * restyles the whole page (about 60 ms a title on the TV).
 */
const BackdropLayer = styled.div`
  position: absolute;
  top: 0;
  left: ${HERO_BACKDROP_LEFT_CSS};
  right: 0;
  height: ${HOME_VH.heroHeight}vh;
  z-index: 1;
  pointer-events: none;
  background-color: #000;
  background-repeat: no-repeat;
  transition: opacity ${BACKDROP_FADE_MS}ms ease;
  ${tvLayer('opacity')}

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const Details = styled.div`
  width: var(--hero-details-width);
  position: relative;
  z-index: 4;
  transition: opacity ${DETAILS_FADE_MS}ms ease;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const Logo = styled.img`
  max-width: min(${HERO_DETAILS.logoWidthVw}vw, ${HERO_DETAILS.logoMaxWidth}px);
  max-height: ${HERO_DETAILS.logoHeightVh}vh;
  object-fit: contain;
  object-position: left bottom;
  margin-bottom: ${HERO_DETAILS.logoGapVh}vh;
`;

const Title = styled.h1`
  margin: 0 0 ${HERO_DETAILS.lineGapVh}vh;
  font-size: ${heroTypeCss('title')};
  line-height: ${HERO_TYPE.title.lineHeight};
  font-weight: ${HERO_TYPE.title.weight};
  text-transform: none;
`;

const Metadata = styled.div`
  margin: 0 0 ${HERO_DETAILS.lineGapVh}vh;
  color: ${PALETTE.text.primary};
  font-size: ${heroTypeCss('metadata')};
  font-weight: ${HERO_TYPE.metadata.weight};
  display: flex;
  align-items: center;
`;

const BadgeGap = styled.span`
  width: 0.9em;
`;

const MetadataRow = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;

  @media (max-width: 860px) {
    flex-wrap: wrap;
    gap: 5.6px;
  }
`;

const MetadataBlock = styled.div`
  min-width: 0;
`;

const Overview = styled.p`
  max-width: ${HERO_DETAILS.overviewCh}ch;
  margin: 0;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: ${HERO_DETAILS.overviewLines};
  overflow: hidden;
  font-size: ${heroTypeCss('overview')};
  line-height: ${HERO_TYPE.overview.lineHeight};
`;

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
  // The hero spans the viewport (`100vw` in the CSS version)
  const shade = useMemo(
    () => (builtForTizen ? getHeroTextGeometry(window.innerWidth, margin) : null),
    [margin]
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

  if (!props.media) return <Hero ref={heroRef} $shade={shade} aria-hidden="true" />;
  return (
    <Hero ref={heroRef} $shade={shade} aria-live="polite">
      {layers.map(layer => (
        <BackdropLayer
          key={layer.id}
          style={{
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
        />
      )}
    </Hero>
  );
};

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
}: {
  hidden: boolean;
  media: MediaDto;
  heroLogo: string | null | undefined;
  preparation: ComponentProps<typeof SourcePreparationStatus>['preparation'];
  availability: ComponentProps<typeof SourcePreparationStatus>['availability'];
}) {
  const details = heroDetailsModel(media);
  return (
    <Details style={{ opacity: hidden ? 0 : 1 }}>
      {heroLogo ? (
        <Logo decoding="async" src={artworkUrl(heroLogo, 'logo', 500)} alt={details.title} />
      ) : (
        <Title>{details.title}</Title>
      )}
      <MetadataRow>
        <MetadataBlock>
          <Metadata>
            {details.metadata.map((text, index) => (
              <Fragment key={index}>
                {index > 0 && <MetadataDot />}
                <span>{text}</span>
              </Fragment>
            ))}
            {details.rating && (
              <>
                {details.metadata.length > 0 && <MetadataDot />}
                <MetadataRating>
                  <StarIcon aria-hidden="true" />
                  {details.rating}
                </MetadataRating>
              </>
            )}
            <BadgeGap />
            <SourcePreparationStatus
              mediaKind={media._type}
              mode="browse"
              preparation={preparation}
              availability={availability}
            />
          </Metadata>
          {details.genres && <Metadata>{details.genres}</Metadata>}
        </MetadataBlock>
      </MetadataRow>
      <Overview>{details.overview}</Overview>
    </Details>
  );
});
