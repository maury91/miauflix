import { type ComponentProps, forwardRef, memo } from 'react';

import { type PreparationInputs, usePreparation } from '../hooks/useHomePreparation';
import { MediaDetails, type MediaDetailsHandle } from './MediaDetails';
import { MediaHero } from './MediaHero';

/**
 * The hero and details, each reading the focused title's preparation itself (usePreparation),
 * so a pushed status re-renders only them, not Home.
 */
export const PreparedMediaHero = memo(function PreparedMediaHero({
  preparationInputs,
  ...props
}: Omit<ComponentProps<typeof MediaHero>, 'preparation'> & {
  preparationInputs: PreparationInputs;
}) {
  const preparation = usePreparation(props.media, preparationInputs, { ignoreWarmup: true });
  return <MediaHero {...props} preparation={preparation} />;
});

export const PreparedMediaDetails = forwardRef<
  MediaDetailsHandle,
  Omit<ComponentProps<typeof MediaDetails>, 'preparation' | 'ref'> & {
    preparationInputs: PreparationInputs;
  }
>(function PreparedMediaDetails({ preparationInputs, ...props }, ref) {
  const preparation = usePreparation(props.media, preparationInputs);
  return <MediaDetails ref={ref} {...props} preparation={preparation} />;
});
