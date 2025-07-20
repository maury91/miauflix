import styled from 'styled-components';
import { IS_TV, PALETTE } from '@/consts';
import { FC, useCallback, useEffect, useRef, useState } from 'react';
import { ShowResponse } from '@miauflix/backend-client';
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { useControls } from '../../../hooks/useControls';

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
  color: ${({ focused }) => (focused ? PALETTE.text.primary : PALETTE.text.secondary)};
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

const Backdrop = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 3;
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
  seasons: ShowResponse['seasons'];
  selected: number;
}> = ({ onSeasonChange, seasons, selected }) => {
  const selectedSeason = seasons[selected];
  const seasonsCount = seasons.length;
  const [temporarySelected, setTemporarySelected] = useState(selected);
  const [firstElementToDisplay, setFirstElementToDisplay] = useState(0);
  const [open, setOpen] = useState(false);
  const seasonsListRef = useRef<HTMLDivElement>(null);
  const on = useControls();

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

  const { focused, focusSelf, ref } = useFocusable({
    focusKey: 'season-selector',
    onEnterPress: handleOpen,
    onArrowPress: handleArrowPress,
  });

  const handleHover = useCallback(() => {
    focusSelf();
  }, [focusSelf]);

  useEffect(() => {
    if (focused) {
      ref.current?.focus();
    }
  }, [focused, ref]);

  useEffect(
    () =>
      on(
        ['back'],
        () => {
          if (open) {
            handleClose();
            return true;
          }
          return false;
        },
        2
      ),
    [on, handleClose, open]
  );

  // ToDo: Display dropdown icon
  return (
    <SeasonSelectorContainer>
      <ClosedDropdown
        focused={focused}
        ref={ref}
        onClick={handleOpen}
        tabIndex={-1}
        onMouseEnter={IS_TV ? undefined : handleHover}
      >
        {selectedSeason.name}
      </ClosedDropdown>
      {open && (
        <>
          {!IS_TV && <Backdrop onClick={handleClose} />}
          <SeasonsList ref={seasonsListRef}>
            {seasons.map((season, index) => (
              <SeasonsItem
                key={season.number}
                focused={temporarySelected === index}
                onClick={handleOpen}
                onMouseEnter={IS_TV ? undefined : () => setTemporarySelected(index)}
              >
                {season.name}
              </SeasonsItem>
            ))}
          </SeasonsList>
        </>
      )}
    </SeasonSelectorContainer>
  );
};
