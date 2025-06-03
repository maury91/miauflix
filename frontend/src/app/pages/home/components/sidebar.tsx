import styled from 'styled-components';
import React, { FC, useCallback, useEffect } from 'react';
import {
  FocusContext,
  getCurrentFocusKey,
  setFocus,
  useFocusable,
} from '@noriginmedia/norigin-spatial-navigation';
import MdiSearch from '~icons/mdi/search';
import { CATEGORIES_FOCUS_KEY, MEDIA_DETAILS_FOCUS_KEY, SIDEBAR_FOCUS_KEY } from '../consts';
import { PALETTE } from '../../../../consts';
import { useAppSelector } from '../../../../store/store';

const HomeSidebarContainer = styled.div<{ opened: boolean }>`
  position: fixed;
  top: 0;
  left: 0;
  width: ${({ opened }) => (opened ? 15 : 5)}vw;
  transition: width 0.3s;
  bottom: 0;
  z-index: 101;
  background: rgba(0, 0, 0, 0.7);

  &:before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 100%;
  }

  &:after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    right: -1vw;
    width: 1vw;
    background: linear-gradient(90deg, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0) 100%);
  }
`;

const SearchContainer = styled.div<{ focused: boolean }>`
  position: absolute;
  font-size: 1.8vw;
  width: 15vw;
  height: 2vw;
  top: calc(50% - 1vw);
  left: 1vw;
  display: flex;
  align-items: center;
  color: ${({ focused }) => (focused ? PALETTE.background.primary : 'white')};

  svg {
    margin-right: 1vw;
    font-size: 2vw;
  }
`;

const Search: FC<{ opened: boolean }> = ({ opened }) => {
  const { ref, focused } = useFocusable({
    focusKey: 'sidebar-search',
  });
  return (
    <SearchContainer ref={ref} focused={focused}>
      <MdiSearch /> {opened && 'Search'}
    </SearchContainer>
  );
};

export const HomeSidebar = () => {
  const { focusKey, ref, focused, focusSelf } = useFocusable({
    saveLastFocusedChild: true,
    trackChildren: true,
    focusKey: SIDEBAR_FOCUS_KEY,
  });
  const currentPage = useAppSelector(state => state.app.currentPage);
  const expand = focused || getCurrentFocusKey() === 'sidebar-search';

  const focusOnPage = useCallback(() => {
    if (currentPage === 'home/categories') {
      setFocus(CATEGORIES_FOCUS_KEY);
    } else {
      setFocus(MEDIA_DETAILS_FOCUS_KEY);
    }
  }, [currentPage]);

  useEffect(() => {
    if (expand) {
      function handleKeyDown(event: KeyboardEvent) {
        if (event.key === 'ArrowRight') {
          focusOnPage();
          event.stopPropagation();
          event.preventDefault();
        }
      }

      document.body.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.removeEventListener('keydown', handleKeyDown);
      };
    }
    return;
  }, [expand, focusOnPage]);

  return (
    <FocusContext.Provider value={focusKey}>
      <HomeSidebarContainer
        ref={ref}
        opened={expand}
        onMouseEnter={focusSelf}
        onMouseLeave={focusOnPage}
      >
        <Search opened={expand} />
      </HomeSidebarContainer>
    </FocusContext.Provider>
  );
};
