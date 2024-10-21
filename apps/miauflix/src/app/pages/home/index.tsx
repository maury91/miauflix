import { AnimatePresence, motion } from 'framer-motion';
import styled from 'styled-components';
import { Movie } from '../../../store/api/movies';
import { useAppSelector } from '../../../store/store';
import { FC } from 'react';
import { Category, useGetCategoriesQuery } from '../../../store/api/categories';

export const HomeContainer = styled(motion.div)`
  position: fixed;
  top: 13vh;
  left: 0;
  right: 0;
  bottom: 0;
`;

const Background = styled.div<{ url: string }>`
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  background: url(${(props) => props.url}) center;
  background-size: cover;
`;

const SelectorContainer = styled.div`
  flex-basis: 50vh;
`;

const SelectorCategory = styled.div``;

const Selector: FC<{
  list: Movie[];
  category: Category;
  selected: number;
}> = ({ category, selected, list }) => {
  const viewSize = 5;
  const viewIndex = Math.floor(selected / viewSize);
  const view = list.slice(
    viewIndex * viewSize,
    viewIndex * viewSize + viewSize
  );
  return (
    <SelectorContainer>
      <SelectorCategory>{category.name}</SelectorCategory>
      {view.map((movie, index) => {
        return <div key={movie.ids.slug}>{movie.title}</div>;
      })}
    </SelectorContainer>
  );
};

const CategorySliderContainer = styled.div``;
const CategoryTitle = styled.div``;

const CategorySlider: FC<{ category: Category }> = ({ category }) => {
  return (
    <CategorySliderContainer>
      <CategoryTitle>{category.name}</CategoryTitle>
    </CategorySliderContainer>
  );
};

export const Home = () => {
  const category = useAppSelector((state) => state.home.category);
  const { data: categories } = useGetCategoriesQuery();
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
