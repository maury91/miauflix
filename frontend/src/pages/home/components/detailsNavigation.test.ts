import { beforeEach, describe, expect, it, vi } from 'vitest';

import { navigateDetails } from './detailsNavigation';

const setupTest = () => {
  const button = () => {
    const element = document.createElement('button');
    element.scrollIntoView = vi.fn();
    document.body.append(element);
    return element;
  };
  return {
    back: button(),
    ratings: [button(), button(), button()],
    primary: [button(), button()],
    episodes: [button(), button()],
  };
};

describe('Details navigation', () => {
  beforeEach(() => document.body.replaceChildren());

  it('moves from primary actions through ratings and Back without activating playback', () => {
    const controls = setupTest();
    controls.primary[0].focus();
    navigateDetails('up', controls);
    expect(document.activeElement).toBe(controls.ratings[0]);
    navigateDetails('right', controls);
    expect(document.activeElement).toBe(controls.ratings[1]);
    const click = vi.fn();
    controls.ratings[1].onclick = click;
    navigateDetails('confirm', controls);
    expect(click).toHaveBeenCalledOnce();
    navigateDetails('up', controls);
    expect(document.activeElement).toBe(controls.back);
    navigateDetails('down', controls);
    expect(document.activeElement).toBe(controls.ratings[0]);
  });

  it('moves between seasons and episodes and keeps focus at list boundaries', () => {
    const controls = setupTest();
    controls.primary[0].focus();
    navigateDetails('down', controls);
    expect(document.activeElement).toBe(controls.primary[1]);
    navigateDetails('right', controls);
    expect(document.activeElement).toBe(controls.episodes[0]);
    navigateDetails('down', controls);
    navigateDetails('down', controls);
    expect(document.activeElement).toBe(controls.episodes[1]);
    navigateDetails('left', controls);
    expect(document.activeElement).toBe(controls.primary[0]);
  });

  it('uses an available fallback and never activates a disabled button', () => {
    const controls = setupTest();
    controls.primary = [];
    controls.ratings[0].disabled = true;
    controls.ratings[0].focus();
    const click = vi.fn();
    controls.ratings[0].onclick = click;
    navigateDetails('confirm', controls);
    expect(click).not.toHaveBeenCalled();
  });
});
