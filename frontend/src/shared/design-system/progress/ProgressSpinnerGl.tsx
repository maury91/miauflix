import { useLayoutEffect } from 'react';

import { visuallyHidden } from '../a11y.css';
import { remPx, useGlNode, useGlPaint, useGlParent } from '../gl';
import { typeScale } from '../tokens';
import type { ProgressSpinnerProps } from './Progress';
import { spinnerMetrics } from './progress.metrics';
import { paintSpinner } from './spinner.art';

/**
 * ProgressSpinner drawn by the GlSurface: the ring at the start of its parent's box, centred
 * vertically, turning (still under reduced motion), and the shown label after it. The status
 * stays in the DOM for the reader, without the icon (an SVG animation running unseen).
 */
export function ProgressSpinnerGl({ label, size = 'md', showLabel = false }: ProgressSpinnerProps) {
  const parent = useGlParent();
  const ringNode = useGlNode();
  const labelNode = useGlNode();
  const px = remPx(size === 'inherit' ? typeScale.body.fontSize : spinnerMetrics.size[size]);
  const middle = (parent?.height ?? 0) / 2;
  const width = parent?.width ?? 0;
  const tint = spinnerMetrics.labelledColor;
  useLayoutEffect(() => {
    ringNode?.set({
      y: middle - px / 2,
      width: px,
      height: px,
      spin: spinnerMetrics.turnMs,
    });
  });
  useGlPaint(ringNode, painter => paintSpinner(painter, px, tint), [px, tint]);
  const shownLabel = showLabel ? label : undefined;
  useGlPaint(
    labelNode,
    painter => {
      if (!shownLabel) return;
      const x = px + remPx(spinnerMetrics.labelGap);
      painter.text(
        {
          text: shownLabel,
          size: remPx(typeScale.body.fontSize),
          weight: typeScale.body.fontWeight,
          lineHeight: parseFloat(typeScale.body.lineHeight),
          color: tint,
          maxWidth: Math.max(1, width - x),
        },
        x,
        middle,
        { anchorY: 0.5 }
      );
    },
    [shownLabel, px, middle, width, tint]
  );
  if (label === undefined) return null;
  return (
    <span role="status" className={visuallyHidden}>
      {label}
    </span>
  );
}
