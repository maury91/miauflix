/**
 * The hero's timing, for both views. On the TV, as on Prime Video: a move fades the details out
 * (DETAILS_FADE_MS); once the selection has rested as long, the new title's details fade in and
 * its image crossfades in (BACKDROP_FADE_MS). Moves before that keep the hero as it is, details
 * dark (a move during the fade-in fades out again from where it is; one during the crossfade ends
 * it on the new image). Each new backdrop is a full-width layer to rasterize and upload, and each
 * new set of details a layout (or text textures), which cost frames during a move.
 */
export const DETAILS_FADE_MS = 200;
/** The backdrop crossfade. */
export const BACKDROP_FADE_MS = 400;
/** How long the selection rests before its backdrop loads and shows. */
export const BACKDROP_REST_MS = DETAILS_FADE_MS;
/** How long the details wait for a logo still being made before showing the title (GL). */
export const LOGO_WAIT_MS = 600;
/** How long the details wait for a known logo's image before showing the title as text. */
export const LOGO_IMAGE_WAIT_MS = 1500;
