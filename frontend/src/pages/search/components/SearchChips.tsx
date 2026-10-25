import { PALETTE } from '@shared/config/constants';
import type { FC, ReactNode } from 'react';
import styled from 'styled-components';

import { focusRing, SectionTitle } from './search.styles';

const Chips = styled.div<{ $columns: number }>`
  display: grid;
  grid-template-columns: repeat(${({ $columns }) => $columns}, minmax(0, 1fr));
  gap: 1.1vh 0.9vw;
`;

const Chip = styled.button<{ $focused: boolean }>`
  ${focusRing};
  display: flex;
  align-items: center;
  gap: 0.9vw;
  min-width: 0;
  height: 5.6vh;
  padding: 0 1vw;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0.5vw;
  color: ${PALETTE.text.primary};
  font:
    400 1.05vw 'Poppins',
    sans-serif;
  text-align: left;
  cursor: pointer;

  > svg {
    flex: none;
    width: 1.35vw;
    height: 1.35vw;
  }

  > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const Section = styled.section`
  margin-bottom: 3vh;
`;

export interface SearchChipItem {
  key: string;
  label: string;
}

interface SearchChipsProps {
  title: string;
  items: ReadonlyArray<SearchChipItem>;
  icon: ReactNode;
  columns: number;
  focusedIndex: number | null;
  onSelect: (index: number) => void;
  onFocusChip: (index: number) => void;
  registerChip: (index: number, element: HTMLButtonElement | null) => void;
}

/** A titled grid of search shortcuts (popular genres or recent searches). */
export const SearchChips: FC<SearchChipsProps> = ({
  title,
  items,
  icon,
  columns,
  focusedIndex,
  onSelect,
  onFocusChip,
  registerChip,
}) => (
  <Section aria-label={title}>
    <SectionTitle>{title}</SectionTitle>
    <Chips $columns={columns}>
      {items.map((item, index) => (
        <Chip
          key={item.key}
          ref={element => registerChip(index, element)}
          type="button"
          tabIndex={focusedIndex === index ? 0 : -1}
          $focused={focusedIndex === index}
          onFocus={() => onFocusChip(index)}
          onMouseEnter={() => onFocusChip(index)}
          onClick={() => onSelect(index)}
        >
          {icon}
          <span>{item.label}</span>
        </Chip>
      ))}
    </Chips>
  </Section>
);
