import { IS_TV, PALETTE } from '@shared/config/constants';
import { forwardRef, type KeyboardEvent } from 'react';
import styled from 'styled-components';

import SearchIcon from '~icons/mdi/magnify';

const Box = styled.label<{ $focused: boolean }>`
  display: flex;
  align-items: center;
  gap: 1.2vw;
  height: 7.4vh;
  padding: 0 1.4vw;
  border: 0.14vw solid ${({ $focused }) => ($focused ? '#fff' : 'rgba(255, 255, 255, 0.72)')};
  border-radius: 0.9vw;
  background: rgba(10, 11, 14, 0.6);
  color: ${PALETTE.text.primary};
  cursor: text;

  > svg {
    flex: none;
    width: 2vw;
    height: 2vw;
  }
`;

const Input = styled.input`
  flex: 1;
  min-width: 0;
  border: 0;
  background: none;
  color: inherit;
  font:
    400 1.55vw 'Poppins',
    sans-serif;
  outline: none;

  &::placeholder {
    color: rgba(255, 255, 255, 0.55);
  }

  /* The on-screen keyboard has its own delete key. */
  &::-webkit-search-cancel-button {
    display: none;
  }
`;

interface SearchBoxProps {
  value: string;
  focused: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onFocus: () => void;
  /** Arrow down leaves the field for the on-screen keyboard. */
  onLeave: () => void;
}

/**
 * The query field. Desktop keyboards type into it directly; on TV it is read-only so the remote
 * uses the on-screen keyboard instead of the system IME.
 */
export const SearchBox = forwardRef<HTMLInputElement, SearchBoxProps>(
  ({ value, focused, onChange, onSubmit, onFocus, onLeave }, ref) => {
    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        onSubmit();
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        onLeave();
      }
    };
    return (
      <Box $focused={focused}>
        <SearchIcon aria-hidden="true" />
        <Input
          ref={ref}
          type="search"
          value={value}
          readOnly={IS_TV}
          maxLength={100}
          placeholder="Search for movies, TV shows, anime..."
          aria-label="Search"
          autoComplete="off"
          spellCheck={false}
          onChange={event => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={onFocus}
        />
      </Box>
    );
  }
);
SearchBox.displayName = 'SearchBox';
