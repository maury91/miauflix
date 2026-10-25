import { PALETTE } from '@shared/ui';
import styled from 'styled-components';

/** Set at build time from the root package version and commit (see vite.config.ts). */
const APP_VERSION: string = import.meta.env['VITE_APP_VERSION'] ?? '';

const Badge = styled.div`
  position: fixed;
  right: 16px;
  bottom: 12px;
  z-index: 1000;
  color: ${PALETTE.text.muted};
  font-size: 12px;
  letter-spacing: 0.02em;
  pointer-events: none;
  user-select: none;
`;

/** The running version, in the corner of every screen but Home, Details and Player. */
export function VersionBadge() {
  if (!APP_VERSION) return null;
  return <Badge data-testid="app-version">Miauflix v{APP_VERSION}</Badge>;
}
