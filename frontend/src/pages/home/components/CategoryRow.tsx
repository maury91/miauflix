import { useGetListQuery } from '@features/media/api/lists.api';
import type { ListDto } from '@miauflix/backend';
import { Spinner } from '@shared/components';
import { PALETTE } from '@shared/config/constants';
import type { FC } from 'react';
import styled from 'styled-components';

import { MediaCard } from './MediaCard';

const RowContainer = styled.section`
  margin-bottom: 28px;
`;

const CategoryTitle = styled.h3`
  margin: 0 0 10px;
  padding: 0;
  font-size: 1.2rem;
  font-weight: 600;
  color: ${PALETTE.text.primary};
`;

const ScrollContainer = styled.div<{ $gap: number }>`
  display: flex;
  gap: ${props => props.$gap}px;
  overflow-x: auto;
  padding-bottom: 8px;

  /* Hide scrollbar but keep functionality */
  scrollbar-width: none;
  &::-webkit-scrollbar {
    display: none;
  }
`;

const SpinnerWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 120px;
`;

const ErrorText = styled.p`
  color: ${PALETTE.background.disabled};
  font-size: 0.9rem;
`;

interface CategoryRowProps {
  category: ListDto;
  mediaWidth: number;
  gap: number;
}

export const CategoryRow: FC<CategoryRowProps> = ({ category, mediaWidth, gap }) => {
  const { data, isLoading, isError } = useGetListQuery({ category: category.slug, page: 0 });

  return (
    <RowContainer>
      <CategoryTitle>{category.name}</CategoryTitle>
      {isLoading && (
        <SpinnerWrapper>
          <Spinner text="Loading..." />
        </SpinnerWrapper>
      )}
      {isError && <ErrorText>Failed to load content.</ErrorText>}
      {data && data.results.length > 0 && (
        <ScrollContainer $gap={gap}>
          {data.results.map(media => (
            <MediaCard key={`${media._type}-${media.id}`} media={media} width={mediaWidth} />
          ))}
        </ScrollContainer>
      )}
    </RowContainer>
  );
};
