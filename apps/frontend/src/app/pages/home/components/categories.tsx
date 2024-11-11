import { FC, useCallback, useEffect, useMemo, useRef } from 'react';
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
import { useSwipe } from '../../../hooks/useSwipe';
import { CategoriesContainer } from './categoriesContainer';
import { CategorySlider } from './categorySlider';
import { IS_SLOW_DEVICE } from '../../../../consts';
import { CategoryDto, MovieDto } from '@miauflix/types';
import { useGetProgressQuery } from '../../../../store/api/progress';
import { useAppSelector } from '../../../../store/store';

const OFFSET = IS_SLOW_DEVICE ? 0 : 5;

interface CategoriesProps {
  onLeft: () => void;
  onMediaSelect: (media: MovieDto) => void;
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
  const scrollAnimationRef = useRef<gsap.QuickToFunc | null>(null);
  const setFocusedSlider = useCallback(
    (direction: 'up' | 'down') => {
      if (categories) {
        const currentFocusKey = getCurrentFocusKey();
        const currentFocusedSlider =
          currentFocusKey && currentFocusKey.startsWith(SLIDER_PREFIX)
            ? currentFocusKey.substring(SLIDER_PREFIX.length)
            : '';
        const currentFocusedIndex = categories.findIndex(
          (category) => category.id === currentFocusedSlider
        );
        if (currentFocusedIndex !== -1) {
          const nextIndex =
            direction === 'up'
              ? currentFocusedIndex - 1
              : currentFocusedIndex + 1;
          if (nextIndex >= 0 && nextIndex < categories.length) {
            setFocus(`${SLIDER_PREFIX}${categories[nextIndex].id}`);
          }
        } else {
          setFocus(`${SLIDER_PREFIX}${categories[0].id}`);
        }
      }
    },
    [categories]
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

  useSwipe({ directions: 'vertical', onSwipe: setFocusedSlider });

  const scrollTo = useCallback((to: number) => {
    if (!scrollAnimationRef.current) {
      scrollAnimationRef.current = gsap.quickTo(
        categoriesWrapperRef.current,
        'y',
        {
          duration: 0.3,
        }
      );
    }
    scrollAnimationRef.current?.(((-to + OFFSET) / 100) * window.innerHeight);
  }, []);

  return (
    <FocusContext.Provider value={focusKey}>
      <CategoriesContainer visible={visible} ref={ref}>
        <div ref={categoriesWrapperRef}>
          {visible &&
            categories.map((category, index) => (
              <CategorySlider
                key={category.id}
                category={category}
                index={index}
                scrollTo={scrollTo}
                onLeft={onLeft}
                onSelect={onMediaSelect}
              />
            ))}
        </div>
      </CategoriesContainer>
    </FocusContext.Provider>
  );
};
