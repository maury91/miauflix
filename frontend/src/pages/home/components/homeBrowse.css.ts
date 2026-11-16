import { style } from '@vanilla-extract/css';

/** The browse screen fills Home's page; the hero, rail and rows are positioned inside it. */
export const page = style({
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
});

/**
 * Dims the page while a panel beside the rail is open: over the rows and the app logo's layer,
 * under the rail (1002, see homeSidebar.css.ts), which carries the panel. Static.
 */
export const panelScrim = style({
  position: 'fixed',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  zIndex: 1001,
  backgroundColor: 'rgba(0, 0, 0, 0.45)',
  pointerEvents: 'none',
});
