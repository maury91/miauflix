import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes } from 'react';
import styled, { css } from 'styled-components';

import { SETTINGS_PALETTE } from '../tokens';

const controlStyles = css<{ $invalid: boolean }>`
  box-sizing: border-box;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid
    ${({ $invalid }) =>
      $invalid ? SETTINGS_PALETTE.color.danger : SETTINGS_PALETTE.background.border};
  border-radius: 4px;
  background: ${SETTINGS_PALETTE.background.input};
  color: ${SETTINGS_PALETTE.text.primary};
  font:
    14px 'Poppins',
    sans-serif;
  &:focus {
    outline: none;
    border-color: ${({ $invalid }) =>
      $invalid ? SETTINGS_PALETTE.color.danger : SETTINGS_PALETTE.color.interactive};
    box-shadow: 0 0 0 3px
      ${({ $invalid }) =>
        $invalid ? SETTINGS_PALETTE.color.dangerSubtle : SETTINGS_PALETTE.color.interactiveSubtle};
  }
  &::placeholder {
    color: ${SETTINGS_PALETTE.text.secondary};
  }
  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
`;
const StyledInput = styled.input<{ $invalid: boolean }>`
  ${controlStyles}
  width: 100%;
`;
const StyledSelect = styled.select<{ $invalid: boolean }>`
  ${controlStyles}
`;

export const FieldLabel = styled.label`
  display: block;
  margin-bottom: 6px;
  color: ${SETTINGS_PALETTE.text.primary};
  font:
    13px 'Poppins',
    sans-serif;
`;

export type InputProps = InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean };
/** Native input. Pair id with FieldLabel.htmlFor; connect help/error text with aria-describedby. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid = false, ...props },
  ref
) {
  return (
    <StyledInput ref={ref} $invalid={invalid} aria-invalid={invalid || undefined} {...props} />
  );
});
export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean };
/** Native select. Pass option children and an accessible label. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { invalid = false, ...props },
  ref
) {
  return (
    <StyledSelect ref={ref} $invalid={invalid} aria-invalid={invalid || undefined} {...props} />
  );
});
