import { color, radius, space, typeScale } from '@shared/design-system/tokens';
import { style } from '@vanilla-extract/css';

/**
 * The notifications panel in the rail's flyout, at the top of the screen: it starts right at the
 * rail's edge, so the pointer travels from the bell into it without leaving the rail. The list
 * scrolls natively and keeps the focused row in view. Margins instead of flex `gap` (Chromium 69).
 */
export const zone = style({
  position: 'absolute',
  top: 0,
  left: 0,
  paddingTop: '3vh',
  outline: 'none',
});

export const panel = style({
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  width: '28rem',
  // Not min(): the 2020 TVs do not have it
  maxWidth: 'calc(100vw - 10rem)',
  maxHeight: '88vh',
  overflow: 'hidden',
  border: `1px solid ${color.borderSubtle}`,
  borderRadius: radius.lg,
  backgroundColor: color.surfaceRaised,
  color: color.text,
});

export const header = style({
  display: 'flex',
  flex: 'none',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: `${space.md} ${space.md} ${space.xs}`,
});

export const list = style({
  flex: '1 1 auto',
  minHeight: 0,
  overflowY: 'auto',
  padding: `0 ${space.xs} ${space.sm}`,
  scrollbarWidth: 'none',
  selectors: {
    '&::-webkit-scrollbar': { display: 'none' },
  },
});

export const poster = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '4.5rem',
  height: '4.5rem',
  overflow: 'hidden',
  borderRadius: radius.sm,
  backgroundColor: color.surfaceHover,
});

export const posterImage = style({
  display: 'block',
  width: '100%',
  height: '100%',
  objectFit: 'cover',
});

export const time = style({
  display: 'block',
  marginTop: space['2xs'],
  fontSize: typeScale.caption.fontSize,
});

export const inlineBadge = style({
  margin: `0 ${space['2xs']}`,
});

export const message = style({
  margin: 0,
  padding: `${space.md} ${space.sm}`,
  textAlign: 'center',
});

export const showRead = style({
  display: 'flex',
  justifyContent: 'center',
  padding: `${space.sm} 0 ${space['2xs']}`,
});

export const sentinel = style({
  height: '1px',
});
