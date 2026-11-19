import type { CollectionGeometry } from '@shared/design-system/carousel/collectionGeometry';
import { ITEM_WIDTH_OF_HEIGHT } from '@shared/design-system/carousel/collectionGeometry';
import { remPx, useGlNode, useGlPaint, useGlParent } from '@shared/design-system/gl';
import { color, typeScale } from '@shared/design-system/tokens';

/**
 * A row's title, and its state when it has no cards, drawn by the GlSurface. The
 * row's DOM title stays for the reader; the carousel draws itself below.
 */
export function CategoryRowTitleGl({
  name,
  state,
  geometry,
}: {
  name: string;
  /** The message in place of the cards, if any. */
  state: string | null;
  geometry: CollectionGeometry;
}) {
  const parent = useGlParent();
  const node = useGlNode();
  const width = parent?.width ?? 0;
  // From the geometry, not the store: the row's sizes all come from collectionGeometry
  const windowHeight = geometry.itemWidth / ITEM_WIDTH_OF_HEIGHT;
  const margin = (width - geometry.contentWidth) / 2;
  useGlPaint(
    node,
    painter => {
      painter.text(
        {
          text: name,
          size: remPx(typeScale.heading.fontSize),
          weight: typeScale.heading.fontWeight,
          lineHeight: parseFloat(typeScale.heading.lineHeight),
          color: color.text,
          maxWidth: width - margin * 2,
        },
        margin,
        0
      );
      if (state)
        painter.text(
          {
            text: state,
            size: remPx(typeScale.body.fontSize),
            weight: 400,
            lineHeight: parseFloat(typeScale.body.lineHeight),
            color: color.textSecondary,
            maxWidth: width - margin * 2,
          },
          margin,
          // Under the title: 5vh + its 1vh margin, then the middle of the cards' 20vh
          windowHeight * 0.06 + windowHeight * 0.1,
          { anchorY: 0.5 }
        );
    },
    [name, state, width, margin, windowHeight]
  );
  return null;
}
