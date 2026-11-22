import { duration, easing, scrim, space, tvSafeArea } from '@shared/design-system/tokens';
import { style } from '@vanilla-extract/css';

/**
 * The player's chrome over the video, on the design system: layout wrappers only (where the
 * header, the prompts and the toolbar sit); every control is a design system component.
 */

export const overlay = style({
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  cursor: 'none',
  selectors: {
    '&[data-shown]': { cursor: 'default' },
  },
});

/** The video itself as a focus target: Confirm plays or pauses, Left and Right seek. */
export const surface = style({
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  zIndex: 0,
  outline: 'none',
  selectors: {
    // Paused: the picture dims under the controls
    '&[data-paused]': { background: scrim.modal },
  },
});

/** The header (Back, logo), fading with the controls. */
export const header = style({
  position: 'absolute',
  top: tvSafeArea.y,
  left: tvSafeArea.x,
  right: tvSafeArea.x,
  zIndex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  opacity: 1,
  visibility: 'visible',
  transition: `opacity ${duration.standard} ${easing.standard}, visibility 0s`,
  selectors: {
    '&[data-hidden]': {
      opacity: 0,
      visibility: 'hidden',
      transition: `opacity ${duration.standard} ${easing.exit}, visibility 0s ${duration.standard}`,
    },
  },
});

export const logo = style({
  height: '4vh',
});

/** The bottom of the player: notices, then the toolbar. */
export const controls = style({
  position: 'absolute',
  right: 0,
  bottom: 0,
  left: 0,
  zIndex: 1,
});

export const notice = style({
  padding: `0 ${space.xl} ${space.sm}`,
});

/** "Skip intro": bottom end, above the controls. */
export const skipIntro = style({
  position: 'absolute',
  right: tvSafeArea.x,
  bottom: '16vh',
  zIndex: 1,
  selectors: {
    '[dir="rtl"] &': { right: 'auto', left: tvSafeArea.x },
  },
});

/** Credits and next episode: two actions centred above the controls. */
export const promptGroup = style({
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: '16vh',
  zIndex: 1,
});

/** The volume slider's slot at the end of the controls row. */
export const volume = style({
  flex: 'none',
  width: '8rem',
});
