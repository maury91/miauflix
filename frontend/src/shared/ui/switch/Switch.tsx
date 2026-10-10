import { type ButtonHTMLAttributes, forwardRef } from 'react';
import styled from 'styled-components';

import { SETTINGS_PALETTE } from '../tokens';

export type SwitchProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onChange' | 'role' | 'aria-checked' | 'type' | 'children'
> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  invalid?: boolean;
};
const Track = styled.button<{ $checked: boolean; $invalid: boolean }>`
  position: relative;
  flex: 0 0 auto;
  width: 46px;
  height: 26px;
  padding: 0;
  border: 1px solid
    ${({ $checked, $invalid }) =>
      $invalid
        ? SETTINGS_PALETTE.color.danger
        : $checked
          ? SETTINGS_PALETTE.color.interactive
          : SETTINGS_PALETTE.background.border};
  border-radius: 999px;
  background: ${({ $checked }) =>
    $checked ? SETTINGS_PALETTE.color.interactive : SETTINGS_PALETTE.background.input};
  cursor: pointer;
  &:focus-visible {
    outline: 2px solid ${SETTINGS_PALETTE.color.interactive};
    outline-offset: 3px;
  }
  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  &::after {
    content: '';
    position: absolute;
    top: 3px;
    left: ${({ $checked }) => ($checked ? '23px' : '3px')};
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: ${({ $checked }) => ($checked ? SETTINGS_PALETTE.background.input : 'white')};
    transition: left 0.2s;
  }
  @media (prefers-reduced-motion: reduce) {
    &::after {
      transition: none;
    }
  }
`;
/** Controlled boolean setting. Supply aria-label or a FieldLabel linked to its id. */
export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  { checked, onCheckedChange, invalid = false, onClick, ...props },
  ref
) {
  return (
    <Track
      {...props}
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-invalid={invalid || undefined}
      $checked={checked}
      $invalid={invalid}
      onClick={event => {
        onClick?.(event);
        if (!event.defaultPrevented) onCheckedChange(!checked);
      }}
    />
  );
});
