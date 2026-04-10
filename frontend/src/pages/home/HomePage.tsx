import { useGetListsQuery } from '@features/media/api/lists.api';
import { Spinner } from '@shared/components';
import { PALETTE } from '@shared/config/constants';
import type { FC } from 'react';
import styled from 'styled-components';

import { CategoryRow } from './components/CategoryRow';
import { useMediaBoxSizes } from './hooks/useMediaBoxSizes';

const PageContainer = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  overflow-y: auto;
  overflow-x: hidden;
  background: #000;
  padding-top: 80px;

  /* Hide scrollbar but keep functionality */
  scrollbar-width: none;
  &::-webkit-scrollbar {
    display: none;
  }
`;

const Content = styled.div<{ $margin: number }>`
  padding: 0 ${props => props.$margin}px;
`;

const LoadingContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
`;

const ErrorContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  color: ${PALETTE.text.primary};
  gap: 12px;
`;

const ErrorText = styled.p`
  color: ${PALETTE.background.disabled};
  font-size: 1rem;
`;

const HomePage: FC = () => {
  const { data: categories, isLoading, isError } = useGetListsQuery();
  const { mediaWidth, gap, margin } = useMediaBoxSizes();

  if (isLoading) {
    return (
      <PageContainer>
        <LoadingContainer>
          <Spinner text="Loading categories..." size={32} />
        </LoadingContainer>
      </PageContainer>
    );
  }

  if (isError || !categories) {
    return (
      <PageContainer>
        <ErrorContainer>
          <ErrorText>Failed to load categories.</ErrorText>
        </ErrorContainer>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <Content $margin={margin}>
        {categories.map(category => (
          <CategoryRow key={category.slug} category={category} mediaWidth={mediaWidth} gap={gap} />
        ))}
      </Content>
    </PageContainer>
  );
};

export default HomePage;
