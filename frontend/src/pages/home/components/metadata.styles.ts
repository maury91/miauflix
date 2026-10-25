import { PALETTE } from '@shared/config/constants';
import styled from 'styled-components';

/** Grey dot between metadata items (`2h 11m • 2025 • ★ 7.3`). */
export const MetadataDot = styled.span.attrs({ 'aria-hidden': true })`
  display: inline-block;
  flex: none;
  width: 0.28em;
  height: 0.28em;
  margin: 0 0.55em;
  border-radius: 50%;
  vertical-align: middle;
  background: ${PALETTE.text.secondary};
`;

/** Rating with a gold star. */
export const MetadataRating = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.3em;

  svg {
    width: 1.05em;
    height: 1.05em;
    color: #f6b93b;
  }
`;
