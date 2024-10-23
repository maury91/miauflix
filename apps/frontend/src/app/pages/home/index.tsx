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

export const HomeContainer = styled(motion.div)`
  position: fixed;
  top: 13vh;
  left: 0;
  right: 0;
  bottom: 0;
`;

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
      {categories.map((category) => {
        return <CategorySlider key={category.id} category={category} />;
      })}
    </>
  );
};
