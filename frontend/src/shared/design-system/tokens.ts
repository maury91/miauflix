/**
 * Design-system foundation tokens (docs/plans/style-guide.md, sections 3 and 5).
 *
 * Plain constants, inlined into `*.css.ts` rules at build time. Never CSS variables: on Chromium 69
 * a restyle re-resolves `var()` in paint properties and repaints the layer
 * (docs/development/css-architecture.md).
 *
 * Sizes are `rem`, so density is only the root font size (see density.css.ts).
 */

export const color = {
  canvas: '#0A0D0F',
  surface: '#111719',
  surfaceRaised: '#182023',
  surfaceHover: '#202A2E',
  control: '#242729',
  borderSubtle: '#30383B',
  borderControl: '#70777A',
  text: '#F5F5F5',
  textSecondary: '#A6ADAF',
  textDisabled: '#70777A',
  /** Logo, progress bars and the seek bar only. Never an action fill. */
  brand: '#D81F27',
  link: '#91A7FF',
  info: '#91A7FF',
  success: '#42B883',
  warning: '#E5A63B',
  danger: '#EF4B52',
  /** Over-media action at rest; selected action on solid surfaces. */
  actionTranslucent: 'rgba(109, 109, 110, 0.8)',
  /** Focused (and pointer-hovered) action fill. */
  actionFocus: '#FFFFFF',
  /** Label and icon on a focused action. */
  onActionFocus: '#000000',
  /** Focused action while pressed. */
  actionPressed: '#E0E0E0',
  /** Action label and icon at rest. */
  onAction: '#FFFFFF',
  /** Action label and icon when disabled (white at 40%). */
  onActionDisabled: 'rgba(255, 255, 255, 0.4)',
  focusOutline: '#FFFFFF',
} as const;

export const scrim = {
  modal: 'rgba(10, 13, 15, 0.7)',
  tile: 'linear-gradient(rgba(10, 13, 15, 0) 35%, rgba(10, 13, 15, 0.85) 100%)',
  heroSide: 'linear-gradient(to right, rgba(10, 13, 15, 0.9) 0%, rgba(10, 13, 15, 0) 60%)',
  heroBottom: 'linear-gradient(rgba(10, 13, 15, 0) 70%, #0A0D0F 100%)',
} as const;

/** The only shadow allowed: popovers and dialogs over media. */
export const shadowOverlay = '0 0.5rem 2rem rgba(0, 0, 0, 0.5)';

export const space = {
  '2xs': '0.25rem',
  xs: '0.5rem',
  sm: '0.75rem',
  md: '1rem',
  lg: '1.5rem',
  xl: '2rem',
  '2xl': '3rem',
  '3xl': '4rem',
} as const;
export type Space = keyof typeof space;

export const radius = {
  sm: '0.25rem',
  md: '0.5rem',
  lg: '1rem',
  full: '999px',
} as const;
export type Radius = keyof typeof radius;

export const fontFamily = "'Poppins', sans-serif";

export const typeScale = {
  display: { fontSize: '3rem', lineHeight: '1.1', fontWeight: 700 },
  title: { fontSize: '2rem', lineHeight: '1.2', fontWeight: 600 },
  heading: { fontSize: '1.375rem', lineHeight: '1.3', fontWeight: 600 },
  body: { fontSize: '1rem', lineHeight: '1.5', fontWeight: 400 },
  label: { fontSize: '1rem', lineHeight: '1.25', fontWeight: 500 },
  caption: { fontSize: '0.875rem', lineHeight: '1.4', fontWeight: 400 },
} as const;
export type TypeRole = keyof typeof typeScale;

/** Shared by buttons, icon buttons, fields, select triggers and tabs. */
export const controlSize = {
  sm: {
    height: '2rem',
    paddingX: '0.75rem',
    icon: '1.25rem',
    iconGap: '0.375rem',
    text: 'caption',
    /** Extra hit area on each side on touch screens, to reach 2.75rem (44px). */
    touchExtension: '0.375rem',
  },
  md: {
    height: '2.5rem',
    paddingX: '1rem',
    icon: '1.5rem',
    iconGap: '0.5rem',
    text: 'label',
    touchExtension: '0.125rem',
  },
  lg: {
    height: '3rem',
    paddingX: '1.5rem',
    icon: '1.75rem',
    iconGap: '0.5rem',
    text: 'label',
    touchExtension: '0',
  },
} as const satisfies Record<string, { text: TypeRole } & Record<string, string>>;
export type ControlSize = keyof typeof controlSize;
export const controlSizes = Object.keys(controlSize) as ControlSize[];

export const focusRing = {
  width: '0.125rem',
  offset: '0.125rem',
} as const;

export const easing = {
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  exit: 'cubic-bezier(0.4, 0, 1, 1)',
} as const;

export const duration = {
  instant: '0ms',
  fast: '120ms',
  standard: '180ms',
  panel: '240ms',
} as const;

export const layer = {
  content: 0,
  stickyChrome: 100,
  popover: 200,
  modalBackdrop: 300,
  modal: 310,
  tooltip: 400,
  notification: 500,
} as const;

/** Web window size classes (Material 3), in em so media queries follow user zoom. */
export const breakpoint = {
  medium: '37.5em',
  expanded: '52.5em',
  large: '75em',
} as const;

/** Root font size per density. TV 720p uses the web size through a media query. */
export const rootFontSize = {
  web: '16px',
  tv: '24px',
} as const;
export type Density = keyof typeof rootFontSize;

/** TV-only: where interactive content and text may sit. */
export const tvSafeArea = {
  x: '4rem',
  y: '2.25rem',
} as const;
