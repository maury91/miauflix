import { forwardRef, type HTMLAttributes } from 'react';
import styled from 'styled-components';

export type ActionRowProps = HTMLAttributes<HTMLDivElement> & {
  density?: 'comfortable' | 'compact';
  direction?: 'row' | 'column';
};
const Row = styled.div<{ $density: 'comfortable' | 'compact'; $direction: 'row' | 'column' }>`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  flex-direction: ${({ $direction }) => $direction};
  gap: ${({ $density }) => ($density === 'compact' ? '10px' : '16px')};
  margin-top: ${({ $density }) => ($density === 'compact' ? '18px' : '24px')};
  padding-top: ${({ $density }) => ($density === 'compact' ? '16px' : '24px')};
  border-top: 1px solid rgba(255, 255, 255, 0.08);
`;
/** Group related actions. Use one primary action; preserve DOM and keyboard order. */
export const ActionRow = forwardRef<HTMLDivElement, ActionRowProps>(function ActionRow(
  { density = 'comfortable', direction = 'row', ...props },
  ref
) {
  return <Row ref={ref} $density={density} $direction={direction} {...props} />;
});
