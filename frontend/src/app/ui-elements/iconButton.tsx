import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import type { FC } from 'react';
import React, { useCallback } from 'react';
import styled from 'styled-components';

import { PALETTE } from '../../consts';

const StyledIconButton = styled.div<{
  disabled?: boolean;
  focused: boolean;
  size: number;
}>`
  position: relative;
  display: inline-flex;
  align-items: center;
  font-family: 'Poppins', sans-serif;
  font-size: ${({ size }) => size}vh;
  outline: ${({ disabled, focused }) =>
    disabled && focused ? `0.5vh ${PALETTE.background.primary} solid` : 'none'};
  color: ${({ disabled, focused }) =>
    disabled
      ? PALETTE.background.disabled
      : focused
        ? PALETTE.background.primary
        : PALETTE.background.secondary};
  ${({ disabled }) => (disabled ? '' : 'cursor: pointer;')}
`;

export interface IconButtonProps {
  disabled?: boolean;
  focusKey?: string;
  icon?: React.ReactElement;
  onClick?: () => void;
  size?: number;
}

export const IconButton: FC<IconButtonProps> = ({
  disabled,
  focusKey,
  icon,
  onClick,
  size = 3,
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
    <StyledIconButton
      focused={focused}
      ref={ref}
      disabled={disabled}
      onMouseEnter={focusSelf}
      onClick={handleOnClick}
      size={size}
    >
      {icon}
    </StyledIconButton>
  );
};
