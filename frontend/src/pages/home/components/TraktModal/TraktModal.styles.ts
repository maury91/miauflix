import { Button } from '@shared/ui/button/Button';
import styled from 'styled-components';

export const Copy = styled.p`
  margin: 0;
  color: #bac1ca;
  font-size: clamp(1rem, 1.65vw, 1.5rem);
  line-height: 1.4;
  font-weight: 400;
`;

export const Action = styled(Button)`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1.25rem;
  min-height: 4.5rem;
  padding: 0.75rem 1rem;

  svg {
    width: 1.75rem;
    height: 1.75rem;
  }
`;
