import { forwardRef, type HTMLAttributes } from 'react';
import styled from 'styled-components';

import { PALETTE } from '../tokens';

export type AlertProps = HTMLAttributes<HTMLDivElement> & {
  severity?: 'error' | 'success' | 'warning' | 'info';
};
const Surface = styled.div<{ $severity: NonNullable<AlertProps['severity']> }>`
  padding: 12px 16px;
  border: 1px solid
    ${({ $severity }) =>
      $severity === 'info'
        ? PALETTE.background.border
        : PALETTE.color[$severity === 'error' ? 'danger' : $severity]};
  border-radius: 8px;
  background: ${PALETTE.background.surface2};
  color: ${({ $severity }) =>
    $severity === 'info'
      ? PALETTE.text.primary
      : PALETTE.color[$severity === 'error' ? 'danger' : $severity]};
  font:
    13px/1.5 'Poppins',
    sans-serif;
  overflow-wrap: anywhere;
`;
/** Contextual feedback. Errors announce assertively; ordinary results use a polite status. */
export const Alert = forwardRef<HTMLDivElement, AlertProps>(function Alert(
  { severity = 'info', role = severity === 'error' ? 'alert' : 'status', ...props },
  ref
) {
  return <Surface ref={ref} role={role} $severity={severity} {...props} />;
});
