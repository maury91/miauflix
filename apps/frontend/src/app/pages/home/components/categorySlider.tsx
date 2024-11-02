import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useGetListQuery } from '../../../../store/api/lists';
import styled from 'styled-components';
import { scaleImage } from '../utils/scaleImage';
import { CategoryDto, MediaDto, MovieDto } from '@miauflix/types';
import { useAppDispatch } from '../../../../store/store';
import {
  changeCategory,
  setSelectedMedia,
} from '../../../../store/slices/home';
import { useMediaBoxSizes } from '../hooks/useMediaBoxSizes';
import { MEDIA_BOX_HEIGHT, MediaBox, MediaHighlight } from './mediaBox';
import { useCategoryNavigation } from '../hooks/useCategoryNavigation';
import { IS_TV } from '../../../../consts';
import { skipToken } from '@reduxjs/toolkit/query';

export const SLIDER_MARGIN = 10;

const CategorySliderContainer = styled.div<{
  margin: number;
  index: number;
}>`
  position: absolute;
  left: ${(props) => props.margin - window.innerWidth * 0.05}px;
  right: ${(props) => props.margin}px;
  top: ${(props) => props.index * (MEDIA_BOX_HEIGHT + SLIDER_MARGIN)}vh;
  height: ${MEDIA_BOX_HEIGHT}vh;
`;

const CategoryTitle = styled.h3`
  height: 5vh;
  margin: 0 0 1vh;
`;

const CategoryContent = styled.div`
  position: relative;
`;

export const CategorySlider: FC<{
  category: CategoryDto;
  index: number;
  scrollTo: (to: number) => void;
  onSelect: (media: MovieDto) => void;
}> = ({ category, index, onSelect, scrollTo }) => {
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const previousList = useGetListQuery(
    page > 0 ? { category: category.id, page: page - 1 } : skipToken
  );
  const currentList = useGetListQuery({ category: category.id, page });
  const nextList = useGetListQuery(
    page + 1 < totalPages
      ? { category: category.id, page: page + 1 }
      : skipToken
  );

  const mediaCount = currentList.data?.total ?? 0;
  const pagesCount = currentList.data?.totalPages ?? 0;
  const pageSize = currentList.data?.pageSize ?? 1;

  useEffect(() => {
    setTotalPages(pagesCount);
  }, [pagesCount]);

  const data = useMemo(() => {
    const combinedData: (MediaDto | null)[] = new Array(
      Math.max(pageSize * (page - 1), 0)
    ).fill(null);
    for (const data of [previousList.data, currentList.data, nextList.data]) {
      if (data) {
        combinedData.push(...data.data);
      }
    }
    return combinedData;
  }, [pageSize, page, previousList.data, currentList.data, nextList.data]);

  const mediaBoxesWrapperRef = useRef<HTMLDivElement>(null);
  const categorySliderAnimationRef = useRef<gsap.QuickToFunc | null>(null);
  const mediaHighlightRef = useRef<HTMLDivElement>(null);
  const mediaHighlightAnimationRef = useRef<gsap.QuickToFunc | null>(null);
  const dispatch = useAppDispatch();
  const { mediaWidth, mediaPerPage, gap, margin } = useMediaBoxSizes();

  const onMediaSelect = useCallback(
    (index: number) => {
      if (data[index]) {
        onSelect(data[index]);
      }
    },
    [data, onSelect]
  );

  const { selected, handleHover, ref, focused, hovered } =
    useCategoryNavigation({
      categoryId: category.id,
      mediaCount,
      onMediaSelect,
    });

  const categoryTranslateX = -(mediaWidth + gap) * selected;
  const highlightTranslateX = IS_TV
    ? mediaWidth + gap
    : (mediaWidth + gap) * (hovered - selected);

  useEffect(() => {
    setPage(Math.round(selected / pageSize));
  }, [pageSize, selected]);

  useEffect(() => {
    if (data[hovered] && focused) {
      dispatch(setSelectedMedia(data[hovered]));
    }
  }, [focused, data, hovered, dispatch]);

  useEffect(() => {
    if (focused) {
      scrollTo(index * (MEDIA_BOX_HEIGHT + SLIDER_MARGIN));
      dispatch(changeCategory(category));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused]);

  useEffect(() => {
    categorySliderAnimationRef.current = gsap.quickTo(
      mediaBoxesWrapperRef.current,
      'x',
      {
        duration: 0.2,
        ease: 'none',
      }
    );
  }, []);

  useEffect(() => {
    if (focused) {
      mediaHighlightAnimationRef.current = gsap.quickTo(
        mediaHighlightRef.current,
        'x',
        {
          duration: 0.2,
          ease: 'none',
        }
      );
    }
  }, [focused]);

  useEffect(() => {
    categorySliderAnimationRef.current?.(categoryTranslateX);
  }, [categoryTranslateX]);

  useEffect(() => {
    mediaHighlightAnimationRef.current?.(highlightTranslateX);
  }, [highlightTranslateX]);

  // ToDo: Add arrows to navigate through the media

  return (
    <CategorySliderContainer margin={margin} index={index} ref={ref}>
      <CategoryTitle>{category.name}</CategoryTitle>
      <CategoryContent>
        {focused && <MediaHighlight ref={mediaHighlightRef} />}
        <div ref={mediaBoxesWrapperRef}>
          {data.map((media, index) => {
            if (
              !media ||
              index < selected - 4 ||
              index > selected + 4 + mediaPerPage
            ) {
              return null;
            }
            return (
              <MediaBox
                key={media.ids.slug}
                src={scaleImage(
                  media.images.backdrop || media.images.backdrops[0]
                )}
                logoSrc={
                  media.images.backdrop ? undefined : media.images.logos[0]
                }
                index={index}
                onMouseEnter={handleHover(index)}
                onClick={() => onMediaSelect(index)}
              />
            );
          })}
        </div>
      </CategoryContent>
    </CategorySliderContainer>
  );
};
