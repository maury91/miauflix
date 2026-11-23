import { CARD_IMAGE_LOGO_BOX } from '@miauwatch/service-contracts/card-image/v1';

const exact = (value: number) => Math.round(value * 1e6) / 1e6;

/**
 * The title logo's box in a landscape frame (shares of its width and height). The catalog draws
 * card images' logos in the same box (CARD_IMAGE_LOGO_BOX), so the CSS, the picture and the
 * server's images have one source. The logo keeps its ratio inside it, at the bottom start.
 */
export const LOGO_BOX = {
  left: CARD_IMAGE_LOGO_BOX.left,
  top: CARD_IMAGE_LOGO_BOX.top,
  width: CARD_IMAGE_LOGO_BOX.width,
  height: exact(CARD_IMAGE_LOGO_BOX.bottom - CARD_IMAGE_LOGO_BOX.top),
} as const;
