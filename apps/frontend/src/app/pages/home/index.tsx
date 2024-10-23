import { AnimatePresence, motion } from 'framer-motion';
import styled from 'styled-components';
import { useAppSelector } from '../../../store/store';
import { useEffect, useState } from 'react';
import { useGetCategoriesQuery } from '../../../store/api/categories';
import {
  getCurrentFocusKey,
  setFocus,
} from '@noriginmedia/norigin-spatial-navigation';
import { CategorySlider } from './components/categorySlider';
import { useMediaBoxSizes } from './hooks/useMediaBoxSizes';
import { scaleImage } from '../../pages/home/utils/scaleImage';

export const HomeContainer = styled(motion.div)`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
`;

const CategoriesContainer = styled.div`
  position: absolute;
  top: 45vh;
  left: 0;
  right: 0;
`;
const MediaDetailsContainer = styled.div<{ margin: number }>`
  position: absolute;
  top: 0;
  height: 53vh;
  left: 0;
  right: 0;
  padding-left: ${(props) => props.margin}px;
  padding-right: ${(props) => props.margin}px;
`;
const MediaDetailsShadow = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(
      90deg,
      rgba(0, 0, 0, 1) 0%,
      rgba(0, 0, 0, 1) 40%,
      rgba(0, 0, 0, 0) 50%,
      rgba(0, 0, 0, 0) 100%
    ),
    linear-gradient(
      0deg,
      rgba(0, 0, 0, 1) 0%,
      rgba(0, 0, 0, 1) 5%,
      rgba(0, 0, 0, 0) 10%,
      rgba(0, 0, 0, 0) 100%
    );
`;
const MediaImage = styled(motion.div)<{ src: string }>`
  background: url(${(props) => props.src}) center right no-repeat;
  background-size: cover;
  position: absolute;
  left: 40vh;
  right: 0;
  top: 0;
  bottom: 0;
`;

const MediaTitle = styled.h2`
  position: absolute;
  top: 10vh;
`;

const useDebounce = (value: string, delay: number): string => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

const MediaDetails = () => {
  const { margin } = useMediaBoxSizes();
  const [imageVisible, setImageVisible] = useState(false);
  const selectedMedia = useAppSelector((state) => state.home.selectedMedia);
  const imageSrc = selectedMedia?.images.backdrops[0];

  useEffect(() => {
    setImageVisible(false);
    const handler = setTimeout(() => {
      if (imageSrc) {
        const img = new Image();
        img.src = imageSrc;
        img.onload = () => {
          setImageVisible(true);
        };
      }
    }, 500);

    return () => {
      clearTimeout(handler);
    };
  }, [imageSrc]);
  if (!selectedMedia) {
    return null;
  }
  return (
    <MediaDetailsContainer margin={margin}>
      <AnimatePresence>
        {imageSrc && (
          <MediaImage
            key={imageSrc}
            src={imageSrc}
            initial={{ opacity: 0 }}
            animate={{ opacity: imageVisible ? 1 : 0 }}
            exit={{ opacity: 0 }}
          />
        )}
      </AnimatePresence>
      <MediaDetailsShadow />
      <MediaTitle>{selectedMedia?.title}</MediaTitle>
    </MediaDetailsContainer>
  );
};

export const Home = () => {
  const category = useAppSelector((state) => state.home.category);
  const { data: categories } = useGetCategoriesQuery();

  useEffect(() => {
    if (categories) {
      const firstCategory = categories[0];
      console.log('focused:', getCurrentFocusKey());
      setFocus(`slider-${firstCategory.id}`);
    }
  }, [categories]);

  if (!categories) {
    return null;
  }
  return (
    <>
      <MediaDetails />
      <CategoriesContainer>
        {categories.map((category) => {
          return <CategorySlider key={category.id} category={category} />;
        })}
      </CategoriesContainer>
    </>
  );
};
