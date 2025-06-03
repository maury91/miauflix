import React, { FC, useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { useMediaBoxSizes } from '../pages/home/hooks/useMediaBoxSizes';
import { useCategoryNavigation } from '../pages/home/hooks/useCategoryNavigation';
import { IS_TV, PALETTE } from '../../consts';
import {
  MEDIA_BOX_HEIGHT,
  MediaBox,
  MediaHighlight,
  OuterMediaHighlight,
  OuterMediaHighlightBackground,
} from '../pages/home/components/mediaBox';
import styled from 'styled-components';
import { usePrevious } from '../hooks/usePrevious';
import { LoadingIndicator } from '../ui-elements/loadingIndicator';
import { setFocus } from '@noriginmedia/norigin-spatial-navigation';
import { SLIDER_PREFIX } from '../pages/home/consts';

const CategoryContent = styled.div`
  position: relative;
  height: ${MEDIA_BOX_HEIGHT * 1.1}vh;
  overflow-x: scroll;
  &::-webkit-scrollbar {
    display: none;
  }
`;

const CategoryLastElement = styled.div<{ mediaCount: number }>`
  width: 1px;
  height: 1px;
  position: absolute;
  left: ${({ mediaCount }) => mediaCount * 37.2}vh;
`;

const CategoryContentWrapper = styled.div<{ mediaCount: number }>`
  width: ${({ mediaCount }) => mediaCount * 37.2}vh;
`;

const SliderContainer = styled.div`
  position: relative;
`;

const Unavailable = styled.div`
  position: absolute;
  transform: rotate(-30deg) translateX(-50%) translateY(-50%);
  top: -50%;
  left: 50%;
  font-size: 3vh;
  text-align: center;
  color: ${PALETTE.background.primary};
  padding: 0.5vh 100%;
  background: black;
`;

export const setFocusOnSlider = (sliderKey: string | number) => {
  setFocus(`${SLIDER_PREFIX}${sliderKey}`);
};

export const Slider: FC<{
  data: Array<{
    backdrop: string;
    id: React.Key;
    logo?: string;
    available?: boolean;
    progress: number;
    text?: string;
    playable?: boolean;
    loading?: boolean;
  } | null>;
  enabled: boolean;
  lastHovered: number;
  onFirstVisibleChange?: (index: number) => void;
  onHover: (index: number) => void;
  onLeft?: () => void;
  onMediaSelect?: (index: number) => void;
  totalData: number;
  sliderKey: string | number;
  restrictUpAndDown?: boolean;
}> = ({
  data,
  enabled,
  lastHovered,
  onFirstVisibleChange,
  onLeft,
  onHover,
  onMediaSelect,
  totalData,
  sliderKey,
  restrictUpAndDown = true,
}) => {
  const sliderContentRef = useRef<HTMLDivElement>(null);
  const mediaHighlightRef = useRef<HTMLDivElement>(null);
  const mediaHighlightAnimationRef = useRef<gsap.QuickToFunc | null>(null);

  const { mediaWidth, mediaPerPage, gap } = useMediaBoxSizes();
  const {
    firstItemToDisplay,
    handleHover,
    ref,
    focused,
    hovered,
    firstVisible,
    handleScroll,
    disableAutoScroll,
  } = useCategoryNavigation({
    key: sliderKey,
    enabled,
    lastHovered,
    onLeft,
    onMediaSelect,
    onHover,
    totalData,
    restrictUpAndDown,
  });
  const previousFocused = usePrevious(focused);

  const highlightTranslateX = (mediaWidth + gap) * hovered;

  useEffect(() => {
    onFirstVisibleChange?.(firstVisible);
  }, [firstVisible, onFirstVisibleChange]);

  useEffect(() => {
    if (data[hovered] && focused) {
      onHover(hovered);
    }
  }, [focused, data, hovered, onHover]);

  useEffect(() => {
    if (focused) {
      mediaHighlightAnimationRef.current = gsap.quickTo(mediaHighlightRef.current, 'x', {
        duration: 0.2,
        ease: 'none',
      });
    }
  }, [focused]);

  useEffect(() => {
    if (focused) {
      mediaHighlightAnimationRef.current?.(
        highlightTranslateX,
        previousFocused ? undefined : highlightTranslateX
      );
    }
  }, [previousFocused, focused, highlightTranslateX]);

  useEffect(() => {
    gsap.fromTo(
      sliderContentRef.current,
      { scrollLeft: sliderContentRef.current?.scrollLeft },
      {
        scrollLeft: firstItemToDisplay * (mediaWidth + gap),
        duration: 0.2,
        ease: 'none',
      }
    );
  }, [gap, mediaWidth, firstItemToDisplay]);

  useEffect(() => {
    mediaHighlightAnimationRef.current?.(
      highlightTranslateX,
      disableAutoScroll ? highlightTranslateX : undefined
    );
  }, [disableAutoScroll, highlightTranslateX]);

  // ToDo: Add arrows to navigate through the media

  return (
    <SliderContainer ref={ref}>
      <CategoryContent onScroll={handleScroll} ref={sliderContentRef}>
        {focused && !IS_TV && <MediaHighlight ref={mediaHighlightRef} />}
        <CategoryContentWrapper mediaCount={data.length + mediaPerPage}>
          {data.map((media, index) => {
            if (!media || index < firstVisible - 4 || index > firstVisible + 4 + mediaPerPage) {
              return null;
            }
            return (
              <MediaBox
                key={media.id}
                src={media.backdrop}
                logoSrc={media.logo}
                index={index}
                onMouseEnter={handleHover(index)}
                onClick={() => onMediaSelect?.(index)}
                progress={media.progress}
              >
                {media.loading && <LoadingIndicator />}
                {media.available === false && <Unavailable>Not available yet</Unavailable>}
                {media.text && <span>{media.text}</span>}
              </MediaBox>
            );
          })}
          <CategoryLastElement mediaCount={data.length + mediaPerPage} />
        </CategoryContentWrapper>
      </CategoryContent>
      {focused && IS_TV && (
        <>
          <OuterMediaHighlightBackground />
          <OuterMediaHighlight />
        </>
      )}
    </SliderContainer>
  );
};
