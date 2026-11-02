import { SETTINGS_PALETTE } from '@shared/config/constants';
import styled from 'styled-components';

export const PAGE_BACKGROUND = '#0B0D0F';
export const PANEL = '#111517';
export const BORDER = '#252B2E';

export const Page = styled.main`
  position: fixed;
  inset: 0;
  z-index: 1000;
  overflow-y: auto;
  background: ${PAGE_BACKGROUND};
  color: ${SETTINGS_PALETTE.text.primary};
  font-family: 'Poppins', sans-serif;
`;

/** Starts where Home's content does, so the shared logo and the title line up. */
export const Content = styled.div`
  box-sizing: border-box;
  padding: 11vh 5vw 64px var(--home-content-left, 5vw);

  @media (max-width: 720px) {
    padding: 11vh 16px 48px 72px;
  }
`;

export const Panel = styled.section`
  border: 1px solid ${BORDER};
  border-radius: 12px;
  background: ${PANEL};
`;

export const IconBox = styled.span<{ $size?: number }>`
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  width: ${({ $size = 44 }) => $size}px;
  height: ${({ $size = 44 }) => $size}px;
  border-radius: 10px;
  background: #1c2124;
  color: ${SETTINGS_PALETTE.text.primary};
  font-size: ${({ $size = 44 }) => Math.round($size * 0.5)}px;
`;

export const Pill = styled.span`
  padding: 3px 12px;
  border-radius: 999px;
  background: #1c2124;
  color: ${SETTINGS_PALETTE.text.secondary};
  font-size: 13px;
  white-space: nowrap;
`;

export const Badge = styled.span`
  padding: 2px 8px;
  border: 1px solid #3a4246;
  border-radius: 999px;
  color: ${SETTINGS_PALETTE.text.secondary};
  font-size: 11px;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  white-space: nowrap;
`;

export const Message = styled.p`
  margin: 12px 0;
  color: ${SETTINGS_PALETTE.text.secondary};
  font-size: 14px;
  line-height: 1.5;
`;

export const Muted = styled.p`
  margin: 0;
  color: ${SETTINGS_PALETTE.text.secondary};
  font-size: 13px;
  line-height: 1.5;
  overflow-wrap: anywhere;
`;

/** Keeps scrolled content from running under the shared logo at the top of the page. */
export const TopBackdrop = styled.div`
  position: fixed;
  inset: 0 0 auto;
  z-index: 1;
  height: 9vh;
  background: ${PAGE_BACKGROUND};
  pointer-events: none;
`;
