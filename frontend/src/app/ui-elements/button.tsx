import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import type { FC, PropsWithChildren } from 'react';
import React, { useCallback } from 'react';
import styled from 'styled-components';

import LineMdLoadingTwotoneLoop from '~icons/line-md/loading-twotone-loop';

import { PALETTE } from '../../consts';

const StyledButton = styled.div<{
  disabled?: boolean;
  focused: boolean;
  loading?: boolean;
  size: number;
}>`
  font-family: 'Poppins', sans-serif;
  padding: ${({ size }) => size / 2}vh;
  font-size: ${({ size }) => size}vh;
  min-width: ${({ size }) => size * 3}vw;
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
  ${({ disabled }) => (disabled ? '' : 'cursor: pointer;')}
  text-transform: uppercase;

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
  size?: number;
  className?: string;
}>;

export const Button: FC<MediaButtonProps> = ({
  children,
  className,
  disabled,
  focusKey,
  icon,
  loading,
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
    <StyledButton
      focused={focused}
      ref={ref}
      disabled={disabled}
      loading={loading}
      onMouseEnter={focusSelf}
      onClick={handleOnClick}
      size={size}
      className={className}
    >
      {icon}
      {loading && <LineMdLoadingTwotoneLoop />}
      {children}
    </StyledButton>
  );
};
