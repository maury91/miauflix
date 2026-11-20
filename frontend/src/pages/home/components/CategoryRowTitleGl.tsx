import type { CollectionGeometry } from '@shared/design-system/carousel/collectionGeometry';
import { ITEM_WIDTH_OF_HEIGHT } from '@shared/design-system/carousel/collectionGeometry';
import { remPx, useGlNode, useGlPaint, useGlParent } from '@shared/design-system/gl';
import { paintMessage } from '@shared/design-system/message/message.art';
import { color, typeScale } from '@shared/design-system/tokens';

import { homeRowLayout } from '../homeLayout';

/** What a row without cards says in their place, as its DOM: a danger Message, or plain text. */
export type CategoryRowState = { kind: 'failed' | 'empty'; text: string } | null;

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
  state: CategoryRowState;
  geometry: CollectionGeometry;
}) {
  const parent = useGlParent();
  const node = useGlNode();
  const width = parent?.width ?? 0;
  // From the geometry, not the store: the row's sizes all come from collectionGeometry
  const { stateMiddle } = homeRowLayout(geometry.itemWidth / ITEM_WIDTH_OF_HEIGHT);
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
      if (state?.kind === 'failed')
        paintMessage(
          painter,
          { tone: 'danger', text: state.text },
          margin,
          stateMiddle,
          width - margin * 2
        );
      else if (state)
        painter.text(
          {
            text: state.text,
            size: remPx(typeScale.body.fontSize),
            weight: 400,
            lineHeight: parseFloat(typeScale.body.lineHeight),
            color: color.textSecondary,
            maxWidth: width - margin * 2,
          },
          margin,
          stateMiddle,
          { anchorY: 0.5 }
        );
    },
    [name, state?.kind, state?.text, width, margin, stateMiddle]
  );
  return null;
}
