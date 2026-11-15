import { FocusScope, NavigationProvider } from '@shared/navigation';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Button } from './button/Button';
import { RemovableChip } from './chip/Chip';
import { Checkbox } from './choice/Checkbox';
import { Disclosure } from './disclosure/Disclosure';
import { Icon } from './icon/Icon';
import { Link } from './link/Link';
import { type Notification, NotificationRegion } from './notification-region/NotificationRegion';
import { EpisodeItem } from './patterns/episode-item/EpisodeItem';
import { FormSection } from './patterns/form-section/FormSection';
import { MediaTile } from './patterns/media-tile/MediaTile';
import { PairingPanel } from './patterns/pairing-panel/PairingPanel';
import { SeekControl } from './patterns/playback-toolbar/SeekControl';
import { piecesToRanges } from './patterns/playback-toolbar/seekRanges';
import { ProfileTile } from './patterns/profile-tile/ProfileTile';
import { SearchKeyboard } from './patterns/search-keyboard/SearchKeyboard';
import {
  alphanumericKeys,
  applyKey,
  type KeyboardKey,
} from './patterns/search-keyboard/searchKeys';
import { Select } from './select/Select';
import { Slider } from './slider/Slider';
import { Surface } from './surface-panel/Surface';
import { Heading, Text } from './text/Text';
import { SurfaceContextProvider } from './surface';

afterEach(() => {
  vi.useRealTimers();
});

describe('Text and Heading', () => {
  it('keeps the outline level apart from the type role', () => {
    render(
      <>
        <Heading level={2}>Plain</Heading>
        <Heading level={2} variant="display">
          Big
        </Heading>
        <Text as="span" tone="secondary" maxLines={1}>
          Helper
        </Text>
      </>
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Plain' })).toHaveAttribute(
      'data-variant',
      'heading'
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Big' })).toHaveAttribute(
      'data-variant',
      'display'
    );
    const helper = screen.getByText('Helper');
    expect(helper.tagName).toBe('SPAN');
    expect(helper).toHaveAttribute('data-tone', 'secondary');
    expect(helper).toHaveAttribute('data-lines', '1');
  });
});

describe('Icon', () => {
  it('is decorative unless it has a label', () => {
    render(
      <>
        <Icon>
          <svg />
        </Icon>
        <Icon label="Available" size="md">
          <svg />
        </Icon>
      </>
    );
    expect(screen.getAllByRole('img')).toHaveLength(1);
    expect(screen.getByRole('img', { name: 'Available' })).toHaveAttribute('data-size', 'md');
  });
});

describe('Surface', () => {
  it('is solid for the actions inside, even over media', () => {
    render(
      <SurfaceContextProvider value="overMedia">
        <Button>Outside</Button>
        <Surface level="raised" border padding="lg" as="section" aria-label="Panel">
          <Button>Inside</Button>
        </Surface>
      </SurfaceContextProvider>
    );
    expect(screen.getByRole('button', { name: 'Outside' })).toHaveAttribute(
      'data-surface',
      'overMedia'
    );
    expect(screen.getByRole('button', { name: 'Inside' })).toHaveAttribute('data-surface', 'solid');
    expect(screen.getByRole('region', { name: 'Panel' })).toHaveAttribute('data-padding', 'lg');
  });
});

describe('Link', () => {
  it('is a native anchor; external links open safely', () => {
    const onPointerFocus = vi.fn();
    render(
      <Link href="https://trakt.tv" external onPointerFocus={onPointerFocus}>
        Trakt
      </Link>
    );
    const link = screen.getByRole('link', { name: 'Trakt' });
    expect(link).toHaveAttribute('href', 'https://trakt.tv');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    fireEvent.mouseMove(link);
    expect(onPointerFocus).toHaveBeenCalledTimes(1);
  });
});

describe('Disclosure', () => {
  it('toggles its region on a press and mounts the content only while expanded', () => {
    const onExpandedChange = vi.fn();
    render(
      <Disclosure
        title="Advanced"
        description="For servers you run yourself"
        onExpandedChange={onExpandedChange}
      >
        <button type="button">Inside</button>
      </Disclosure>
    );
    const trigger = screen.getByRole('button', { name: 'Advanced' });
    expect(trigger).toHaveAccessibleDescription('For servers you run yourself');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'Inside' })).toBeNull();
    fireEvent.click(trigger);
    expect(onExpandedChange).toHaveBeenCalledWith(true);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('region', { name: 'Advanced' })).toContainElement(
      screen.getByRole('button', { name: 'Inside' })
    );
  });

  it('follows a controlled state', () => {
    render(
      <Disclosure title="Advanced" expanded={false} onExpandedChange={() => undefined}>
        Content
      </Disclosure>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }));
    expect(screen.getByRole('button', { name: 'Advanced' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });
});

describe('NotificationRegion', () => {
  function Harness({ initial }: { initial: Notification[] }) {
    const [notifications, setNotifications] = useState(initial);
    return (
      <>
        <button
          type="button"
          onClick={() =>
            setNotifications(current => [
              ...current,
              { id: 'urgent', body: 'Connection lost', urgent: true, duration: null },
            ])
          }
        >
          Add
        </button>
        <NotificationRegion
          label="Notifications"
          notifications={notifications}
          onExpire={id => setNotifications(current => current.filter(item => item.id !== id))}
        />
      </>
    );
  }

  it('announces each notification once and expires it after its duration', () => {
    vi.useFakeTimers();
    render(
      <Harness initial={[{ id: 'saved', tone: 'success', toneLabel: 'Done', body: 'Saved' }]} />
    );
    const status = screen.getByRole('status', { name: 'Notifications' });
    expect(status).toHaveTextContent('Done. Saved');
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('alert', { name: 'Notifications' })).toHaveTextContent(
      'Connection lost'
    );
    // Not announced again
    expect(status).toHaveTextContent('Done. Saved');
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByText('Saved', { selector: '[data-placement] *' })).toBeNull();
    // `null` stays until the feature removes it
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByText('Connection lost', { selector: '[data-placement] *' })).toBeTruthy();
  });

  it('announces every notification added in one update', () => {
    render(
      <NotificationRegion
        label="Notifications"
        notifications={[
          { id: 'a', body: 'Added to list', duration: null },
          { id: 'b', body: 'Download started', duration: null },
        ]}
        onExpire={() => undefined}
      />
    );
    const status = screen.getByRole('status', { name: 'Notifications' });
    expect(status).toHaveTextContent('Added to list');
    expect(status).toHaveTextContent('Download started');
  });
});

describe('MediaTile', () => {
  it('is named by the title and described by the rest; missing artwork shows the title', () => {
    render(
      <MediaTile
        title="Dune"
        supportingText="2024"
        artwork={null}
        badge={{ label: '4K', accessibleLabel: 'Ultra HD' }}
        progress={0.5}
        progressText="Half watched"
      />
    );
    const tile = screen.getByRole('button', { name: 'Dune' });
    expect(tile).toHaveAccessibleDescription('2024 Ultra HD Half watched');
    expect(tile).toHaveTextContent('Dune');
  });

  it('drops a logo that fails to load', () => {
    const { container } = render(<MediaTile title="Dune" artwork="art.png" logo="logo.png" />);
    const logo = container.querySelector('img[src="logo.png"]')!;
    expect(logo).toHaveAttribute('alt', '');
    fireEvent.error(logo);
    expect(container.querySelector('img[src="logo.png"]')).toBeNull();
  });
});

describe('EpisodeItem', () => {
  it('plays from the row, reads the progress in words and keeps trailing actions apart', () => {
    const onClick = vi.fn();
    render(
      <EpisodeItem
        title="2. The big empty"
        description="Stranded survivors."
        metadata="44 min"
        progress={0.3}
        progressText="29 min left"
        selected
        onClick={onClick}
        trailing={<button type="button">Mark watched</button>}
      />
    );
    const row = screen.getByRole('button', { name: '2. The big empty' });
    expect(row).toHaveAttribute('aria-current', 'true');
    expect(row).toHaveAccessibleDescription('Stranded survivors. 29 min left 44 min');
    expect(row).not.toContainElement(screen.getByRole('button', { name: 'Mark watched' }));
    fireEvent.click(row);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('ProfileTile', () => {
  it('describes the tile in edit mode only', () => {
    const { rerender } = render(<ProfileTile name="Ana" avatar="a.png" editLabel="Edit profile" />);
    expect(screen.getByRole('button', { name: 'Ana' })).not.toHaveAccessibleDescription(
      'Edit profile'
    );
    rerender(<ProfileTile name="Ana" avatar="a.png" editing editLabel="Edit profile" />);
    expect(screen.getByRole('button', { name: 'Ana' })).toHaveAccessibleDescription('Edit profile');
  });
});

describe('FormSection', () => {
  it('submits once per submit without reloading, and marks itself busy', () => {
    const onSubmit = vi.fn();
    const { rerender } = render(
      <FormSection title="Sign in" onSubmit={onSubmit} actions={<Button type="submit">Go</Button>}>
        <input aria-label="Email" />
      </FormSection>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    rerender(
      <FormSection
        title="Sign in"
        onSubmit={onSubmit}
        busy
        actions={<Button type="submit">Go</Button>}
      >
        <input aria-label="Email" />
      </FormSection>
    );
    expect(screen.getByRole('region', { name: 'Sign in' }).querySelector('form')).toHaveAttribute(
      'aria-busy',
      'true'
    );
  });
});

describe('PairingPanel', () => {
  it('spells the code out and shows a labelled spinner while loading', () => {
    const { rerender } = render(
      <PairingPanel title="Pair" state="loading" loadingLabel="Getting a code" userCode="AB-1" />
    );
    expect(screen.getByRole('status')).toHaveTextContent('Getting a code');
    expect(screen.queryByText('AB-1')).toBeNull();
    rerender(
      <PairingPanel
        title="Pair"
        state="ready"
        loadingLabel="Getting a code"
        userCode="AB-1"
        userCodeLabel="Code"
      />
    );
    expect(screen.getByText('Code: A B - 1')).toBeInTheDocument();
    expect(screen.getByText('AB-1')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('SearchKeyboard', () => {
  const space: KeyboardKey = { id: 'space', kind: 'space', label: 'Space' };

  it('types, spaces, deletes and clears', () => {
    expect(applyKey('du', { id: 'n', kind: 'character', value: 'n' })).toBe('dun');
    expect(applyKey('', space)).toBe('');
    expect(applyKey('dune', space)).toBe('dune ');
    expect(applyKey('dune ', space)).toBe('dune ');
    expect(applyKey('dune', { id: 'd', kind: 'delete', label: 'Delete' })).toBe('dun');
    // A character outside the basic plane goes whole
    expect(applyKey('a😀', { id: 'd', kind: 'delete', label: 'Delete' })).toBe('a');
    expect(applyKey('dune', { id: 'c', kind: 'clear', label: 'Clear' })).toBe('');
  });

  it('builds six full rows of characters and a row of actions', () => {
    const keys = alphanumericKeys({
      space: { label: 'Space' },
      delete: { label: 'Delete' },
      clear: { label: 'Clear' },
    });
    expect(keys).toHaveLength(39);
    expect(keys.slice(36).reduce((columns, key) => columns + (key.span ?? 1), 0)).toBe(6);
  });

  it('reports the new text on a key press', () => {
    const onChange = vi.fn();
    render(
      <SearchKeyboard
        label="Keyboard"
        keys={[
          { id: 'a', kind: 'character', value: 'a' },
          { id: 'delete', kind: 'delete', label: 'Delete', icon: <svg /> },
        ]}
        value="dun"
        onChange={onChange}
        focusedId="a"
      />
    );
    expect(screen.getByRole('group', { name: 'Keyboard' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'a' })).toHaveAttribute('data-focused');
    fireEvent.click(screen.getByRole('button', { name: 'a' }));
    expect(onChange).toHaveBeenLastCalledWith('duna');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onChange).toHaveBeenLastCalledWith('du');
  });
});

describe('SeekControl', () => {
  it('merges downloaded pieces into ranges', () => {
    expect(piecesToRanges([1, 1, 0, 0, 1, 0, 1, 1])).toEqual([
      { start: 0, end: 0.25 },
      { start: 0.5, end: 0.625 },
      { start: 0.75, end: 1 },
    ]);
    expect(piecesToRanges([])).toEqual([]);
    expect(piecesToRanges([false, false])).toEqual([]);
  });

  it('draws the blocks under the brand fill and is disabled while the length is unknown', () => {
    const { container, rerender } = render(
      <SeekControl
        label="Seek"
        position={30}
        duration={0}
        onSeek={() => undefined}
        valueText="0:30"
      />
    );
    expect(screen.getByRole('slider', { name: 'Seek' })).toBeDisabled();
    rerender(
      <SeekControl
        label="Seek"
        position={30}
        duration={120}
        onSeek={() => undefined}
        valueText="0:30 of 2:00"
        downloaded={[{ start: 0, end: 0.5 }]}
      />
    );
    const slider = screen.getByRole('slider', { name: 'Seek' });
    expect(slider).toBeEnabled();
    expect(slider).toHaveAttribute('aria-valuetext', '0:30 of 2:00');
    expect(container.querySelector('[data-tone="brand"]')).not.toBeNull();
    const block = container.querySelector<HTMLElement>('[style*="width: 50%"]');
    expect(block?.style.left).toBe('0%');
  });
});

describe('DOM focus under the navigation layer', () => {
  it('follows virtual focus onto native controls and composite parts', () => {
    // jsdom lays nothing out: every element gets one client rect
    vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(
      () => [{}] as unknown as DOMRectList
    );
    const onBrightness = vi.fn();
    const onRemove = vi.fn();
    render(
      <NavigationProvider>
        <FocusScope id="page">
          <Checkbox navId="terms" label="Accept" checked={false} onCheckedChange={() => {}} />
          <Slider navId="volume" label="Volume" value={50} onChange={() => {}} />
          <Slider navId="brightness" label="Brightness" value={50} onChange={onBrightness} />
          <Select
            navId="quality"
            label="Quality"
            mode="native"
            items={[{ value: 'hd', label: 'HD' }]}
            value="hd"
            onChange={() => {}}
          />
          <RemovableChip
            navId="recent"
            removeLabel="Remove dune"
            onRemove={onRemove}
            onClick={() => {}}
          >
            dune
          </RemovableChip>
        </FocusScope>
      </NavigationProvider>
    );
    const press = (key: string) =>
      fireEvent.keyDown(document.activeElement ?? document.body, { key });
    expect(document.activeElement).toBe(screen.getByRole('checkbox', { name: 'Accept' }));
    press('ArrowDown');
    expect(document.activeElement).toBe(screen.getByRole('slider', { name: 'Volume' }));
    // Slider to slider: the second one's keys work
    press('ArrowDown');
    expect(document.activeElement).toBe(screen.getByRole('slider', { name: 'Brightness' }));
    press('ArrowLeft');
    expect(onBrightness).toHaveBeenCalledTimes(1);
    // A select isn't mirrored (its keys would be its own), and the range lets go
    press('ArrowDown');
    expect(document.activeElement).toBe(document.body);
    // A select the pointer focused lets go when focus moves on
    screen.getByRole('combobox', { name: 'Quality' }).focus();
    act(() => {
      press('Tab');
    });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'dune' }));
    press('ArrowRight');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Remove dune' }));
    press('Enter');
    expect(onRemove).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });

  it('opens a native select’s picker on Confirm', () => {
    vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(
      () => [{}] as unknown as DOMRectList
    );
    const showPicker = vi.fn();
    Object.defineProperty(HTMLSelectElement.prototype, 'showPicker', {
      configurable: true,
      value: showPicker,
    });
    render(
      <NavigationProvider>
        <FocusScope id="page">
          <Select
            navId="language"
            label="Language"
            mode="native"
            items={[
              { value: 'en', label: 'English' },
              { value: 'fr', label: 'French' },
            ]}
            value="en"
            onChange={() => {}}
          />
        </FocusScope>
      </NavigationProvider>
    );
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(showPicker).toHaveBeenCalledTimes(1);
    expect(showPicker.mock.contexts[0]).toBe(screen.getByRole('combobox', { name: 'Language' }));
    delete (HTMLSelectElement.prototype as { showPicker?: unknown }).showPicker;
    vi.restoreAllMocks();
  });
});
