import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from 'react';
import styled, { css } from 'styled-components';

export type ButtonColor = 'primary' | 'secondary';

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'color'> & {
  /** Visual treatment for the action. */
  color?: ButtonColor;
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

const StyledButton = styled.button<{ $color: ButtonColor }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  min-height: 72px;
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
`;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { color = 'primary', icon, children, type = 'button', ...props },
  ref
) {
  return (
    <StyledButton ref={ref} type={type} $color={color} {...props}>
      {icon !== undefined && <span aria-hidden="true">{icon}</span>}
      {children}
    </StyledButton>
  );
});
