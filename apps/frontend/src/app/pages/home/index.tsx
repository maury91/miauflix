import { motion } from 'framer-motion';
import styled from 'styled-components';
import { useAppSelector } from '../../../store/store';
import { useEffect } from 'react';
import { useGetCategoriesQuery } from '../../../store/api/categories';
import {
  getCurrentFocusKey,
  setFocus,
} from '@noriginmedia/norigin-spatial-navigation';
import { CategorySlider } from './components/categorySlider';
import { useMediaBoxSizes } from './hooks/useMediaBoxSizes';

export const HomeContainer = styled(motion.div)`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
`;

const CategoriesContainer = styled.div`
  position: absolute;
  top: 40vh;
  left: 0;
  right: 0;
`;
const MediaDetailsContainer = styled.div<{ margin: number }>`
  position: absolute;
  top: 0;
  left: ${(props) => props.margin}px;
  right: ${(props) => props.margin}px;
`;

const MediaDetails = () => {
  const { margin } = useMediaBoxSizes();
  const selectedMedia = useAppSelector((state) => state.home.selectedMedia);
  if (!selectedMedia) {
    return null;
  }
  return (
    <MediaDetailsContainer margin={margin}>
      <h2>{selectedMedia?.title}</h2>
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
