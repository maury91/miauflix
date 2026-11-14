import type { MouseEvent, MouseEventHandler } from 'react';

/** Blocks activation while loading (also keeps a submit button from submitting its form). */
export function guardLoading<T extends Element>(
  loading: boolean,
  onClick: MouseEventHandler<T> | undefined
): MouseEventHandler<T> | undefined {
  if (!loading) return onClick;
  return (event: MouseEvent<T>) => {
    event.preventDefault();
  };
}
