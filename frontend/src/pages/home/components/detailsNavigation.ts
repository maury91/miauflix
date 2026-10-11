import type { HomeAction, NavigationOutcome } from '../homeNavigation';

type Controls = {
  back: HTMLButtonElement | null;
  ratings: HTMLButtonElement[];
  primary: HTMLButtonElement[];
  episodes: HTMLButtonElement[];
};

/** Navigate actual controls so pointer, Tab, and remote input share one focus. */
export function navigateDetails(action: HomeAction, controls: Controls): NavigationOutcome {
  const { back, ratings, primary, episodes } = controls;
  const active = document.activeElement as HTMLButtonElement;
  const fallback = primary[0] ?? ratings[0] ?? back;
  let target: HTMLButtonElement | null | undefined;
  if (action === 'confirm') {
    const button = [back, ...ratings, ...primary, ...episodes].includes(active) ? active : fallback;
    if (button && !button.disabled) button.click();
    return { type: 'handled' };
  }
  const ratingIndex = ratings.indexOf(active);
  const primaryIndex = primary.indexOf(active);
  const episodeIndex = episodes.indexOf(active);
  if (active === back) {
    target = action === 'down' || action === 'right' ? (ratings[0] ?? fallback) : back;
  } else if (ratingIndex >= 0) {
    if (action === 'left' || action === 'right') {
      target =
        ratings[
          Math.max(0, Math.min(ratings.length - 1, ratingIndex + (action === 'left' ? -1 : 1)))
        ];
    } else target = action === 'up' ? back : fallback;
  } else if (primaryIndex >= 0) {
    if (action === 'up') target = primary[primaryIndex - 1] ?? ratings[0] ?? back;
    if (action === 'down') target = primary[primaryIndex + 1] ?? active;
    if (action === 'right') target = episodes[0] ?? active;
    if (action === 'left') target = active;
  } else if (episodeIndex >= 0) {
    if (action === 'left') target = primary[0] ?? fallback;
    if (action === 'up') target = episodes[episodeIndex - 1] ?? ratings[0] ?? back;
    if (action === 'down') target = episodes[episodeIndex + 1] ?? active;
    if (action === 'right') target = active;
  } else target = fallback;
  target?.focus();
  target?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  return { type: 'handled' };
}
