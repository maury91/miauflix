import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import type { FC, PropsWithChildren } from 'react';
import React, { useCallback } from 'react';
import styled from 'styled-components';

import LineMdLoadingTwotoneLoop from '~icons/line-md/loading-twotone-loop';

import { PALETTE } from '../../../../consts';

const StyledMediaButton = styled.button<{
  disabled?: boolean;
  focused: boolean;
  loading?: boolean;
}>`
  position: relative;
  display: inline-flex;
  align-items: center;
  font-family: 'Poppins', sans-serif;
  padding: 1.5vh;
  font-size: 3vh;
  min-width: 10vw;
  outline: ${({ disabled, focused }) =>
    disabled && focused ? `0.5vh ${PALETTE.background.primary} solid` : 'none'};
  color: ${({ disabled, focused }) =>
    disabled ? PALETTE.text.disabled : focused ? PALETTE.text.primary : PALETTE.text.secondary};
  background-color: ${({ disabled, focused }) =>
    disabled
      ? PALETTE.background.disabled
      : focused
        ? PALETTE.background.primary
        : PALETTE.background.secondary};
  font-weight: ${({ focused }) => (focused ? 600 : 500)};
  border-radius: 1vh;
  text-align: center;
  margin-right: 1vw;
  ${({ disabled }) => (disabled ? '' : 'cursor: pointer;')}
  text-transform: uppercase;
  border: none;
  background: none;

  svg {
    margin: 0 0.5vw;
  }

  svg:nth-of-type(1) {
    transform: ${({ loading }) => (loading ? 'scale(0.7)' : '')};
    transition: transform 0.3s;
  }

  svg:nth-of-type(2) {
    position: absolute;
  }
`;

type MediaButtonProps = PropsWithChildren<{
  disabled?: boolean;
  focusKey?: string;
  icon?: React.ReactElement;
  loading?: boolean;
  onClick?: () => void;
}>;

export const MediaButton: FC<MediaButtonProps> = ({
  children,
  disabled,
  focusKey,
  icon,
  loading,
  onClick,
}) => {
  const handleOnClick = useCallback(() => {
    if (!disabled && onClick) {
      onClick();
    }
  }, [disabled, onClick]);
  const { focused, ref, focusSelf } = useFocusable({
    focusKey,
    onEnterPress: handleOnClick,
  });

  // ToDo: if disabled but not loading display an error icon
  return (
    <StyledMediaButton
      focused={focused}
      ref={ref}
      disabled={disabled}
      loading={loading}
      onMouseEnter={focusSelf}
      onClick={handleOnClick}
    >
      {icon}
      {loading && <LineMdLoadingTwotoneLoop />}
      {children}
    </StyledMediaButton>
  );
};
