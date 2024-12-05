import React, { FC, useCallback, useEffect, useMemo, useRef } from 'react';
import { useGetCategoriesQuery } from '../../../../store/api/categories';
import { gsap } from 'gsap';
import {
  FocusContext,
  getCurrentFocusKey,
  setFocus,
  useFocusable,
} from '@noriginmedia/norigin-spatial-navigation';
import {
  CATEGORIES_FOCUS_KEY,
  CONTINUE_WATCHING_CATEGORY,
  SLIDER_PREFIX,
} from '../consts';
import { CategoriesContainer, CategoriesWrapper } from './categoriesContainer';
import { CategorySlider, SLIDER_MARGIN } from './categorySlider';
import { CategoryDto, MediaDto } from '@miauflix/types';
import { useGetProgressQuery } from '../../../../store/api/progress';
import { useAppSelector } from '../../../../store/store';
import { OFFSET } from './categories.consts';
import { MEDIA_BOX_HEIGHT } from './mediaBox';
import { debounce } from '../../../utils/debounce';
import { useNavigation } from '../../../hooks/useNavigation';
import { IS_TV } from '../../../../consts';

interface CategoriesProps {
  onLeft: () => void;
  onMediaSelect: (media: MediaDto) => void;
  visible: boolean;
}

const useCategories = () => {
  const userId = useAppSelector((state) => state.app.currentUserId);
  const { data: progressCategory, isLoading: isProgressCategoryLoading } =
    useGetProgressQuery(userId, {
      pollingInterval: 30000,
    });
  const { data: normalCategories, isLoading: areNormalCategoriesLoading } =
    useGetCategoriesQuery();

  return useMemo<CategoryDto[]>(() => {
    const categories: CategoryDto[] = [];
    if (isProgressCategoryLoading || areNormalCategoriesLoading) {
      return [];
    }
    if (progressCategory && progressCategory.length) {
      categories.push({
        id: CONTINUE_WATCHING_CATEGORY,
        name: 'Continue Watching',
      });
    }
    return [...categories, ...(normalCategories ?? [])];
  }, [
    areNormalCategoriesLoading,
    isProgressCategoryLoading,
    normalCategories,
    progressCategory,
  ]);
};

export const Categories: FC<CategoriesProps> = ({
  onLeft,
  onMediaSelect,
  visible,
}) => {
  const categories = useCategories();

  const { focusKey, ref, focusSelf } = useFocusable({
    saveLastFocusedChild: true,
    focusKey: CATEGORIES_FOCUS_KEY,
  });
  const categoriesWrapperRef = useRef<HTMLDivElement | null>(null);

  const focusCategory = useCallback(
    (index: number) => {
      if (ref.current) {
        const boundedIndex = Math.max(
          0,
          Math.min(index, categories.length - 1)
        );
        const top =
          (boundedIndex * (MEDIA_BOX_HEIGHT + SLIDER_MARGIN) + 5) *
          (window.innerHeight / 100);
        gsap.fromTo(
          ref.current,
          { scrollTop: ref.current.scrollTop },
          { scrollTop: top, duration: 0.2 }
        );
        setFocus(`${SLIDER_PREFIX}${categories[boundedIndex].id}`);
      }
    },
    [categories, ref]
  );

  const onArrow = useCallback(
    (direction: 'up' | 'down') => {
      const currentFocusKey = getCurrentFocusKey();
      const isFocusedOnCategory =
        currentFocusKey && currentFocusKey.startsWith(SLIDER_PREFIX);
      if (isFocusedOnCategory) {
        const focusedCategoryId = currentFocusKey.substring(
          SLIDER_PREFIX.length
        );
        const categoryIndex = categories.findIndex(
          (category) => category.id === focusedCategoryId
        );
        if (categoryIndex !== -1) {
          const nextCategoryIndex =
            direction === 'down' ? categoryIndex + 1 : categoryIndex - 1;
          if (nextCategoryIndex >= 0 && nextCategoryIndex < categories.length) {
            focusCategory(nextCategoryIndex);
          }
        }
        return;
      }
    },
    [categories, focusCategory]
  );

  useNavigation({
    page: 'home',
    onArrow,
  });

  const magneticScroll = debounce(
    useCallback(
      (top: number) => {
        const focusedCategory = Math.round(
          top / (window.innerHeight / 100) / (MEDIA_BOX_HEIGHT + SLIDER_MARGIN)
        );
        focusCategory(focusedCategory);
      },
      [focusCategory]
    ),
    50
  );

  const handleCategoriesScroll = useCallback(
    (ev: React.UIEvent<HTMLDivElement>) => {
      magneticScroll(ev.currentTarget.scrollTop);
    },
    [magneticScroll]
  );

  useEffect(() => {
    if (visible) {
      focusSelf();
    }
  }, [focusSelf, visible]);

  useEffect(() => {
    if (categories.length) {
      const firstCategory = categories[0];
      if (
        !(
          getCurrentFocusKey() && getCurrentFocusKey().startsWith(SLIDER_PREFIX)
        )
      ) {
        setFocus(`${SLIDER_PREFIX}${firstCategory.id}`);
      }
    }
  }, [categories]);

  return (
    <FocusContext.Provider value={focusKey}>
      <CategoriesContainer
        visible={visible}
        ref={ref}
        onScroll={IS_TV ? undefined : handleCategoriesScroll}
      >
        <CategoriesWrapper
          categoriesCount={categories.length}
          ref={categoriesWrapperRef}
        >
          {visible &&
            categories.map((category, index) => (
              <CategorySlider
                key={category.id}
                category={category}
                index={index}
                onLeft={onLeft}
                onSelect={onMediaSelect}
              />
            ))}
        </CategoriesWrapper>
      </CategoriesContainer>
    </FocusContext.Provider>
  );
};
