import { type ForwardedRef, useId } from 'react';

import { joinIds } from '../ids';
import { useNavFocus } from '../navFocus';
import type { CollectionTileProps } from './CollectionTile';

/**
 * What both of CollectionTile's views need: navigation focus, ids, the description and the
 * button's props (focus, aria, pointer). The views add the class and what they render.
 */
export function useCollectionTile(
  {
    label: _label,
    supportingText,
    visual: _visual,
    ratio: _ratio,
    labelPlacement: _labelPlacement,
    labelHidden: _labelHidden,
    badge,
    progress: _progress,
    progressText,
    focused = false,
    onPointerFocus,
    glVisual: _glVisual,
    glBadge: _glBadge,
    type = 'button',
    onMouseMove,
    navId,
    'aria-describedby': callerDescribedBy,
    ...props
  }: CollectionTileProps,
  forwardedRef: ForwardedRef<HTMLButtonElement>
) {
  const id = useId();
  const nav = useNavFocus(navId, { focused, disabled: props.disabled }, forwardedRef);
  const labelId = `${id}-label`;
  return {
    id,
    nav,
    /** Focused and enabled: the outline and scale show. */
    active: nav.focused && !props.disabled,
    buttonProps: {
      ...props,
      ref: nav.ref,
      type,
      'data-focused': nav.focused || undefined,
      'aria-labelledby': labelId,
      'aria-describedby': joinIds(
        callerDescribedBy,
        supportingText && `${id}-supporting`,
        Boolean(badge) && `${id}-badge`,
        progressText && `${id}-progress`
      ),
      onMouseMove: (event: React.MouseEvent<HTMLButtonElement>) => {
        nav.onPointerFocus();
        onPointerFocus?.();
        onMouseMove?.(event);
      },
    },
  };
}
