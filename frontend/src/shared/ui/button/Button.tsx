import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from 'react';
import styled, { css } from 'styled-components';

import { SETTINGS_PALETTE } from '../tokens';

export type ButtonColor = 'primary' | 'secondary';

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'color'> & {
  /** Visual treatment for the action. */
  color?: ButtonColor;
  /** Brand actions or neutral settings/account actions. */
  appearance?: 'brand' | 'settings';
  /** Text treatment for low-emphasis disclosures and utility actions. */
  variant?: 'solid' | 'text';
  /** Large is the existing TV-friendly default. */
  size?: 'small' | 'medium' | 'large';
  fullWidth?: boolean;
  /** Square icon action; supply an aria-label. */
  iconOnly?: boolean;
  /** Show only the icon until focused, while retaining the accessible label. Requires icon. */
  collapseWhenNotFocused?: boolean;
  /** Optional leading icon. Icons are hidden from assistive technology. */
  icon?: ReactNode;
};

const primaryStyles = css`
  border-color: #ff4a63;
  background: linear-gradient(115deg, #ff263c 0%, #eb0030 100%);
  color: #ffffff;
  box-shadow: 0 8px 36px rgba(243, 11, 53, 0.3);

  &:hover:not(:disabled) {
    filter: brightness(1.08);
  }

  &:active:not(:disabled) {
    background: linear-gradient(115deg, #e91f35 0%, #d6002b 100%);
    box-shadow: 0 4px 20px rgba(243, 11, 53, 0.24);
  }
`;

const secondaryStyles = css`
  border-color: #3f474e;
  background: linear-gradient(115deg, #242a2f 0%, #1c2227 100%);
  color: #e1e4e8;

  &:hover:not(:disabled) {
    filter: brightness(1.12);
  }

  &:active:not(:disabled) {
    background: linear-gradient(115deg, #1d2328 0%, #171c20 100%);
  }
`;

const StyledButton = styled.button<{
  $color: ButtonColor;
  $appearance: 'brand' | 'settings';
  $variant: 'solid' | 'text';
  $size: 'small' | 'medium' | 'large';
  $fullWidth: boolean;
  $iconOnly: boolean;
  $collapseWhenNotFocused: boolean;
}>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  min-height: 52px;
  min-width: 176px;
  padding: 12px 16px;
  border: 1px solid transparent;
  border-radius: 12px;
  font:
    600 22px/1.2 'Poppins',
    sans-serif;
  letter-spacing: 0;
  white-space: nowrap;
  cursor: pointer;
  transition:
    filter 140ms ease,
    background 140ms ease,
    box-shadow 140ms ease;

  ${({ $color }) => ($color === 'primary' ? primaryStyles : secondaryStyles)}

  ${({ $size }) =>
    $size !== 'large' &&
    css`
      min-height: ${$size === 'small' ? '36px' : '42px'};
      min-width: 0;
      padding: ${$size === 'small' ? '8px 18px' : '10px 24px'};
      gap: 8px;
      border-radius: 4px;
      font-size: ${$size === 'small' ? '13px' : '14px'};
      font-weight: 500;
    `}

  ${({ $appearance, $color }) =>
    $appearance === 'settings' &&
    css`
      border-color: ${$color === 'primary'
        ? SETTINGS_PALETTE.color.primaryButton
        : SETTINGS_PALETTE.background.border};
      background: ${$color === 'primary' ? SETTINGS_PALETTE.color.primaryButton : 'transparent'};
      color: ${$color === 'primary'
        ? SETTINGS_PALETTE.background.primary
        : SETTINGS_PALETTE.text.primary};
      box-shadow: none;
      &:hover:not(:disabled) {
        filter: none;
        border-color: ${$color === 'primary'
          ? SETTINGS_PALETTE.color.primaryButtonHover
          : SETTINGS_PALETTE.color.interactive};
        background: ${$color === 'primary'
          ? SETTINGS_PALETTE.color.primaryButtonHover
          : SETTINGS_PALETTE.color.interactiveSubtle};
      }
      &:active:not(:disabled) {
        background: ${$color === 'primary'
          ? SETTINGS_PALETTE.color.primaryButtonPressed
          : SETTINGS_PALETTE.color.interactiveSubtle};
        box-shadow: none;
      }
    `}

  ${({ $variant, $appearance }) =>
    $variant === 'text' &&
    css`
      min-width: 0;
      border-color: transparent;
      background: transparent;
      box-shadow: none;
      color: ${$appearance === 'settings' ? SETTINGS_PALETTE.text.secondary : '#e1e4e8'};
      &:hover:not(:disabled),
      &:active:not(:disabled) {
        filter: none;
        border-color: transparent;
        background: rgba(255, 255, 255, 0.08);
        color: #fff;
        box-shadow: none;
      }
    `}

  ${({ $fullWidth }) =>
    $fullWidth &&
    css`
      width: 100%;
      min-width: 0;
    `}
  ${({ $iconOnly, $size }) =>
    $iconOnly &&
    css`
      flex: 0 0 auto;
      min-width: 0;
      width: ${$size === 'large' ? '52px' : $size === 'medium' ? '42px' : '36px'};
      min-height: ${$size === 'large' ? '52px' : $size === 'medium' ? '42px' : '36px'};
      padding: 0;
    `}

  &:focus-visible {
    /* The screenshot uses a white keyline with a dark three-pixel separation. */
    outline: 1px solid #ffffff;
    outline-offset: 2px;
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    filter: saturate(0.7);
  }

  > svg,
  > span[aria-hidden='true'] {
    flex: 0 0 auto;
    width: 28px;
    height: 28px;
  }

  > svg {
    display: block;
  }

  > span[aria-hidden='true'] > svg {
    display: block;
    width: 28px;
    height: 28px;
  }

  ${({ $collapseWhenNotFocused }) =>
    $collapseWhenNotFocused &&
    css`
      && {
        min-width: 0;
        gap: 0;
      }

      > [data-button-label] {
        display: inline-grid;
        grid-template-columns: 0fr;
        margin-inline-start: 0;
        transition:
          grid-template-columns 180ms ease,
          margin-inline-start 180ms ease;
      }

      > [data-button-label] > span {
        min-width: 0;
        overflow: hidden;
      }

      &:focus > [data-button-label] {
        grid-template-columns: 1fr;
        margin-inline-start: 0.5rem;
      }

      @media (prefers-reduced-motion: reduce) {
        > [data-button-label] {
          transition: none;
        }
      }
    `}
`;

/** Render a native button with a forwarded ref, defaulting to type="button" and hiding its icon from assistive technology. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    color = 'primary',
    appearance = 'brand',
    variant = 'solid',
    size = 'large',
    fullWidth = false,
    iconOnly = false,
    collapseWhenNotFocused = false,
    icon,
    children,
    type = 'button',
    ...props
  },
  ref
) {
  return (
    <StyledButton
      ref={ref}
      type={type}
      $color={color}
      $appearance={appearance}
      $variant={variant}
      $size={size}
      $fullWidth={fullWidth}
      $iconOnly={iconOnly}
      $collapseWhenNotFocused={collapseWhenNotFocused && icon !== undefined && !iconOnly}
      {...props}
    >
      {icon !== undefined && <span aria-hidden="true">{icon}</span>}
      {collapseWhenNotFocused && icon !== undefined && !iconOnly ? (
        <span data-button-label>
          <span>{children}</span>
        </span>
      ) : (
        children
      )}
    </StyledButton>
  );
});
