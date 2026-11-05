import { afterEach, describe, expect, it } from 'vitest';

import { moveFocus, NAV_ATTRIBUTE, NAV_REGION_ATTRIBUTE } from './spatialFocus';

type Box = [left: number, top: number, width: number, height: number];

/** Lay out focusable buttons at fixed boxes (jsdom has no layout). */
function place(parent: HTMLElement, id: string, [left, top, width, height]: Box, extra = {}) {
  const element = document.createElement('button');
  element.id = id;
  element.setAttribute(NAV_ATTRIBUTE, '');
  Object.entries(extra).forEach(([name, value]) => element.setAttribute(name, String(value)));
  element.getBoundingClientRect = () =>
    ({
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
    }) as DOMRect;
  parent.appendChild(element);
  return element;
}

function region(parent: HTMLElement) {
  const element = document.createElement('div');
  element.setAttribute(NAV_REGION_ATTRIBUTE, '');
  parent.appendChild(element);
  return element;
}

/** A 4-column grid of 100×80 tiles with 10 px gaps, `count` tiles, starting at (300, 200). */
function grid(parent: HTMLElement, prefix: string, count: number, top = 200) {
  return Array.from({ length: count }, (_, index) =>
    place(parent, `${prefix}${index}`, [
      300 + (index % 4) * 110,
      top + Math.floor(index / 4) * 90,
      100,
      80,
    ])
  );
}

const setup = () => {
  const container = document.createElement('main');
  document.body.appendChild(container);
  return container;
};

const press = (container: HTMLElement, ...directions: Parameters<typeof moveFocus>[1][]) =>
  directions.map(direction => {
    moveFocus(container, direction);
    return document.activeElement?.id;
  });

afterEach(() => {
  document.body.innerHTML = '';
});

describe('moveFocus', () => {
  it('moves through a grid by rows and reaches a shorter last row', () => {
    const container = setup();
    const tiles = grid(container, 'tile', 6);
    tiles[2].focus();
    // Down from the third column lands on the last row's nearest tile
    expect(press(container, 'down', 'up')).toEqual(['tile5', 'tile1']);
  });

  it('stays at the end of a row instead of jumping to another', () => {
    const container = setup();
    const tiles = grid(container, 'tile', 6);
    tiles[5].focus();
    expect(press(container, 'right', 'left', 'left')).toEqual(['tile5', 'tile4', 'tile4']);
  });

  it('keeps Up and Down within an area and crosses areas with Left and Right', () => {
    const container = setup();
    const preview = region(container);
    place(preview, 'surprise', [40, 420, 160, 50]);
    const form = region(container);
    // Form tiles scrolled so a later row sits below the preview's button
    const tiles = grid(form, 'tile', 8, 300);
    tiles[4].focus();
    // The preview's button is lower, but Down stays in the form (nothing below there)
    expect(press(container, 'down', 'up')).toEqual(['tile4', 'tile0']);
    tiles[4].focus();
    expect(press(container, 'left', 'right')).toEqual(['surprise', 'tile4']);
  });

  it('returns to the item it left when crossing back', () => {
    const container = setup();
    const preview = region(container);
    place(preview, 'surprise', [40, 200, 160, 50]);
    const form = region(container);
    const tiles = grid(form, 'tile', 8);
    tiles[4].focus();
    // Nearest in height to the button would be tile0; coming back goes to tile4
    expect(press(container, 'left', 'right')).toEqual(['surprise', 'tile4']);
  });

  it('lands on the selected tab when entering the tab list', () => {
    const container = setup();
    const tablist = document.createElement('div');
    tablist.setAttribute('role', 'tablist');
    container.appendChild(tablist);
    place(tablist, 'shape', [300, 100, 80, 40], { role: 'tab', 'aria-selected': false });
    place(tablist, 'face', [400, 100, 80, 40], { role: 'tab', 'aria-selected': true });
    const tiles = grid(container, 'tile', 4);
    tiles[0].focus();
    expect(press(container, 'up', 'left')).toEqual(['face', 'shape']);
  });

  it('goes from a wide field to the first item below it', () => {
    const container = setup();
    const field = place(container, 'name', [300, 100, 430, 50]);
    place(container, 'save', [300, 200, 120, 50]);
    place(container, 'cancel', [440, 200, 120, 50]);
    field.focus();
    expect(press(container, 'down')).toEqual(['save']);
    // Left of a wide field is only what lies past its left edge
    field.focus();
    expect(press(container, 'left')).toEqual(['name']);
  });
});
