import styled from 'styled-components';
import { IS_TV, PALETTE } from '../../../../consts';
import React, { FC, useCallback, useEffect, useRef, useState } from 'react';
import { ExtendedShowDto } from '@miauflix/types';
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { useNavigation } from '../../../hooks/useNavigation';

const BaseSeasonItem = styled.div<{ focused: boolean }>`
  align-items: center;
  border-radius: 1vh;
  text-align: center;
  font-family: 'Poppins', sans-serif;
  padding: 1.5vh;
  font-size: 3vh;
  cursor: pointer;
  text-transform: uppercase;
  position: relative;
  color: ${({ focused }) =>
    focused ? PALETTE.text.primary : PALETTE.text.secondary};
  background-color: ${({ focused }) =>
    focused ? PALETTE.background.primary : PALETTE.background.secondary};
  font-weight: ${({ focused }) => (focused ? 600 : 500)};
  outline: none;
`;

const ClosedDropdown = styled(BaseSeasonItem)`
  margin: 5vh 0;
`;

const SeasonSelectorContainer = styled.div`
  position: relative;
  width: 25vw;
`;

const SeasonsList = styled.div`
  position: absolute;
  top: -1vh;
  left: -1vh;
  padding: 1vh;
  right: 0;
  background: ${PALETTE.background.popup};
  border-radius: 1vh;
  z-index: 4;
  max-height: 32.5vh;
  overflow-y: auto;
  &::-webkit-scrollbar {
    ${IS_TV ? 'display: none;' : ''}
  }
`;

const SeasonsItem = styled(BaseSeasonItem)`
  &:not(:last-child) {
    margin-bottom: 1vh;
  }
`;

export const SeasonSelector: FC<{
  onSeasonChange: (season: number) => void;
  seasons: ExtendedShowDto['seasons'];
  selected: number;
}> = ({ onSeasonChange, seasons, selected }) => {
  const selectedSeason = seasons[selected];
  const seasonsCount = seasons.length;
  const [temporarySelected, setTemporarySelected] = useState(selected);
  const [firstElementToDisplay, setFirstElementToDisplay] = useState(0);
  const [open, setOpen] = useState(false);
  const seasonsListRef = useRef<HTMLDivElement>(null);

  const handleOpen = useCallback(() => {
    if (open) {
      setOpen(false);
      onSeasonChange(temporarySelected);
    } else {
      setOpen(true);
      setTemporarySelected(selected);
    }
  }, [onSeasonChange, open, selected, temporarySelected]);

  const handleClose = useCallback(() => {
    console.log('handleClose');
    setOpen(false);
  }, []);

  const handleArrowPress = useCallback(
    (direction: string) => {
      if (open) {
        const nextValue =
          direction === 'up'
            ? Math.max(temporarySelected - 1, 0)
            : Math.min(temporarySelected + 1, seasonsCount - 1);
        setTemporarySelected(nextValue);
        setFirstElementToDisplay(Math.min(nextValue, seasonsCount - 4));
        return false;
      }
      return true;
    },
    [open, seasonsCount, temporarySelected]
  );

  useEffect(() => {
    if (seasonsListRef.current) {
      seasonsListRef.current.scrollTo({
        top: (8.5 * firstElementToDisplay * window.innerHeight) / 100,
        behavior: 'smooth',
      });
    }
  }, [firstElementToDisplay]);

  const { focused, ref } = useFocusable({
    focusKey: 'season-selector',
    onEnterPress: handleOpen,
    onArrowPress: handleArrowPress,
  });

  useEffect(() => {
    if (focused) {
      ref.current?.focus();
      console.log(ref.current);
    }
  }, [focused, ref]);

  useNavigation({
    element: ref.current,
    enabled: open,
    onBack: handleClose,
  });

  // ToDo: Display dropdown icon
  return (
    <SeasonSelectorContainer>
      <ClosedDropdown
        focused={focused}
        ref={ref}
        onClick={handleOpen}
        tabIndex={-1}
      >
        {selectedSeason.title}
      </ClosedDropdown>
      {open && (
        <SeasonsList ref={seasonsListRef}>
          {seasons.map((season, index) => (
            <SeasonsItem
              key={season.number}
              focused={temporarySelected === index}
              onMouseEnter={
                IS_TV ? undefined : () => setTemporarySelected(index)
              }
            >
              {season.title}
            </SeasonsItem>
          ))}
        </SeasonsList>
      )}
    </SeasonSelectorContainer>
  );
};
