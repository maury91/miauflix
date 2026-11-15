import { MediaDetails } from '@features/details/ui/MediaDetails';
import { type ComponentProps, memo } from 'react';

import { type PreparationInputs, usePreparation } from '../hooks/useHomePreparation';
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

export function PreparedMediaDetails({
  preparationInputs,
  ...props
}: Omit<ComponentProps<typeof MediaDetails>, 'preparation'> & {
  preparationInputs: PreparationInputs;
}) {
  const preparation = usePreparation(props.media, preparationInputs);
  return <MediaDetails {...props} preparation={preparation} />;
}
