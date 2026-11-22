import { mediaBoxSizes } from '@pages/home/home-layout';
import { FocusScope, NavigationProvider } from '@shared/navigation/NavigationProvider';
import { fireEvent, render, screen } from '@testing-library/react';
import { act, createRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ActionGroup } from './action-group/ActionGroup';
import { Artwork } from './artwork/Artwork';
import { Avatar } from './avatar/Avatar';
import { Badge } from './badge/Badge';
import { Button } from './button/Button';
import { Carousel } from './carousel/Carousel';
import { revealItem, stepCarousel } from './carousel/carouselNavigation';
import { collectionGeometry } from './carousel/collectionGeometry';
import { Chip, FilterChip, RemovableChip } from './chip/Chip';
import { Checkbox } from './choice/Checkbox';
import { RadioGroup } from './choice/RadioGroup';
import { Switch } from './choice/Switch';
import { CollectionTile } from './collection-tile/CollectionTile';
import { Dialog } from './dialog/Dialog';
import { Divider } from './divider/Divider';
import { EmptyState } from './empty-state/EmptyState';
import { NumberField } from './field/NumberField';
import { PasswordField } from './field/PasswordField';
import { SearchField } from './field/SearchField';
import { TextField } from './field/TextField';
import { IconButton } from './icon-button/IconButton';
import { IconButtonGroup } from './icon-button-group/IconButtonGroup';
import { KeyHint } from './key-hint/KeyHint';
import { Container, SafeArea } from './layout/Container';
import { Grid, GridItem } from './layout/Grid';
import { gridLayout, stepGrid } from './layout/gridNavigation';
import { Inline } from './layout/Inline';
import { SplitLayout } from './layout/SplitLayout';
import {
  isSplitStacked,
  paneEntry,
  paneOf,
  rememberPaneFocus,
  stepSplit,
} from './layout/splitNavigation';
import { Stack } from './layout/Stack';
import { resolveResponsive } from './layout/windowClass';
import { List } from './list/List';
import { ListItem } from './list/ListItem';
import { SettingRow } from './list/SettingRow';
import { Menu } from './menu/Menu';
import { stepAction } from './menu/menuItems';
import { Message } from './message/Message';
import { NavItem, NavRail } from './nav-rail/NavRail';
import { Popover } from './popover/Popover';
import { isTopPopover, pushPopover } from './popover/popoverStack';
import { ProgressBar, ProgressSpinner } from './progress/Progress';
import { ProgressButton } from './progress-button/ProgressButton';
import { revealOffset } from './scroll-area/revealOffset';
import { ScrollArea } from './scroll-area/ScrollArea';
import { Section } from './section/Section';
import { Select } from './select/Select';
import { Skeleton, SkeletonGroup } from './skeleton/Skeleton';
import { Slider } from './slider/Slider';
import { snapSliderValue, stepSliderValue } from './slider/sliderValue';
import { TabPanel, Tabs } from './tabs/Tabs';
import { SurfaceContextProvider } from './surface';

const Icon = () => <svg data-testid="icon" />;

describe('Button', () => {
  it('is a non-submitting button with its state as static attributes', () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <Button ref={ref} icon={<Icon />} size="lg" selected fullWidth>
        Watch now
      </Button>
    );
    const button = screen.getByRole('button', { name: 'Watch now' });
    expect(ref.current).toBe(button);
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveAttribute('data-surface', 'solid');
    expect(button).toHaveAttribute('data-size', 'lg');
    expect(button).toHaveAttribute('data-selected');
    expect(button).toHaveAttribute('data-full-width');
    expect(button).not.toHaveAttribute('aria-busy');
  });

  it('shows virtual focus as data-focused, whatever DOM focus does', () => {
    const { rerender } = render(<Button>Play</Button>);
    const button = screen.getByRole('button');
    button.focus();
    expect(button).not.toHaveAttribute('data-focused');
    rerender(<Button focused>Play</Button>);
    expect(button).toHaveAttribute('data-focused');
  });

  it('keeps the same class whatever its props, so no new CSS is ever needed', () => {
    const { rerender } = render(<Button>Play</Button>);
    const initial = screen.getByRole('button').className;
    rerender(
      <Button size="sm" selected loading fullWidth focused>
        Play
      </Button>
    );
    expect(screen.getByRole('button').className).toBe(initial);
  });

  it('reads the surface from its container', () => {
    render(
      <SurfaceContextProvider value="overMedia">
        <Button>More info</Button>
      </SurfaceContextProvider>
    );
    expect(screen.getByRole('button')).toHaveAttribute('data-surface', 'overMedia');
  });

  it('shows a spinner instead of its icon, stays enabled and ignores activation while loading', () => {
    const onClick = vi.fn();
    const submit = vi.fn();
    render(
      <form onSubmit={submit}>
        <Button type="submit" icon={<Icon />} loading onClick={onClick}>
          Save
        </Button>
      </form>
    );
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByTestId('icon')).toBeNull();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it('hides its icon from assistive technology', () => {
    render(<Button icon={<Icon />}>Play</Button>);
    expect(screen.getByTestId('icon').parentElement).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('IconButton', () => {
  it('is a labelled circle', () => {
    const onClick = vi.fn();
    render(<IconButton label="Mute" icon={<Icon />} onClick={onClick} />);
    const button = screen.getByRole('button', { name: 'Mute' });
    expect(button).toHaveAttribute('data-shape', 'circle');
    expect(button).not.toHaveAttribute('aria-pressed');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is a toggle when pressed is given, and shows "on" as selected', () => {
    const { rerender } = render(<IconButton label="Subtitles" icon={<Icon />} pressed={false} />);
    const button = screen.getByRole('button', { name: 'Subtitles' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).not.toHaveAttribute('data-selected');
    rerender(<IconButton label="Subtitles" icon={<Icon />} pressed />);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveAttribute('data-selected');
  });

  it('is skipped by navigation when disabled', () => {
    render(<IconButton label="Settings" icon={<Icon />} disabled />);
    expect(screen.getByRole('button', { name: 'Settings' })).toBeDisabled();
  });
});

describe('ProgressButton', () => {
  const setup = () => {
    const onAction = vi.fn();
    const { rerender } = render(
      <ProgressButton duration={1000} initialProgress={0.5} paused focused onAction={onAction}>
        Next episode
      </ProgressButton>
    );
    const button = screen.getByRole('button', { name: 'Next episode' });
    // The clipping layer comes last, after the icon slot and the label
    const clip = button.lastElementChild as HTMLElement;
    return { onAction, button, clip, rerender };
  };

  it('counts down with its timing inline and starts partway', () => {
    const { button, clip } = setup();
    expect(button).toHaveAttribute('data-progress');
    expect(button).toHaveAttribute('data-paused');
    expect(clip).toHaveAttribute('aria-hidden', 'true');
    expect(clip.style.animationDuration).toBe('1000ms');
    expect(clip.style.animationDelay).toBe('-500ms');
  });

  it('runs its action once when the countdown fills', () => {
    const { onAction, button, clip } = setup();
    fireEvent.animationEnd(clip);
    fireEvent.animationEnd(clip);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(button).not.toHaveAttribute('data-progress');
  });

  it('runs at once on activation and not again when the time is up', () => {
    const { onAction, button, clip } = setup();
    fireEvent.click(button);
    fireEvent.animationEnd(clip);
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("ignores the copy's own animation end", () => {
    const { onAction, clip } = setup();
    fireEvent.animationEnd(clip.firstElementChild as HTMLElement);
    expect(onAction).not.toHaveBeenCalled();
  });

  it('ends the countdown for good on an arrow key, then acts as a plain button', () => {
    const { onAction, button, clip } = setup();
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(button).not.toHaveAttribute('data-progress');
    fireEvent.animationEnd(clip);
    expect(onAction).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('keeps counting on other keys and ends the countdown when virtual focus moves away', () => {
    const { button, rerender } = setup();
    fireEvent.keyDown(window, { key: 'a' });
    expect(button).toHaveAttribute('data-progress');
    expect(button).toHaveAttribute('data-focused');
    rerender(
      <ProgressButton duration={1000} onAction={() => undefined}>
        Next episode
      </ProgressButton>
    );
    expect(button).not.toHaveAttribute('data-progress');
    expect(button).not.toHaveAttribute('data-focused');
  });
});

describe('TextField', () => {
  it('names the input with its label and describes it with its supporting text', () => {
    render(
      <TextField label="Email" description="For sign-in only." error="Enter a full address." />
    );
    const input = screen.getByRole('textbox', { name: 'Email' });
    expect(input).toHaveAccessibleDescription('For sign-in only. Enter a full address.');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.parentElement).toHaveAttribute('data-invalid');
  });

  it('shows virtual focus on the frame, whatever DOM focus does', () => {
    const { rerender } = render(<TextField label="Email" />);
    const input = screen.getByRole('textbox');
    input.focus();
    expect(input.parentElement).not.toHaveAttribute('data-focused');
    rerender(<TextField label="Email" focused />);
    expect(input.parentElement).toHaveAttribute('data-focused');
  });

  it('takes pointer focus on the frame but not over its trailing action', () => {
    const onPointerFocus = vi.fn();
    render(
      <TextField
        label="Address"
        onPointerFocus={onPointerFocus}
        trailing={<IconButton label="Copy" icon={<Icon />} />}
      />
    );
    fireEvent.mouseMove(screen.getByRole('button', { name: 'Copy' }));
    expect(onPointerFocus).not.toHaveBeenCalled();
    fireEvent.mouseMove(screen.getByRole('textbox'));
    expect(onPointerFocus).toHaveBeenCalledTimes(1);
  });
});

describe('PasswordField', () => {
  it('reveals with the toggle, keeping the value, and reports pointer focus per part', () => {
    const onPointerFocus = vi.fn();
    render(
      <PasswordField
        label="Password"
        showLabel="Show password"
        hideLabel="Hide password"
        defaultValue="secret"
        focusedPart="reveal"
        onPointerFocus={onPointerFocus}
      />
    );
    const input = screen.getByLabelText('Password');
    const toggle = screen.getByRole('button', { name: 'Show password' });
    expect(input).toHaveAttribute('type', 'password');
    expect(toggle).toHaveAttribute('data-focused');
    expect(input.parentElement).not.toHaveAttribute('data-focused');
    fireEvent.mouseMove(toggle);
    expect(onPointerFocus).toHaveBeenLastCalledWith('reveal');
    fireEvent.click(toggle);
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveValue('secret');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });
});

describe('SearchField', () => {
  it('keeps the clear action room while empty and submits on Enter', () => {
    const onSearch = vi.fn();
    const { rerender } = render(
      <SearchField
        label="Search"
        value=""
        onChange={() => undefined}
        onClear={() => undefined}
        clearLabel="Clear"
        onSearch={onSearch}
        submitLabel="Search"
      />
    );
    const clear = screen.getByRole('button', { name: 'Clear', hidden: true });
    expect(clear).toBeDisabled();
    rerender(
      <SearchField
        label="Search"
        value="Dune"
        onChange={() => undefined}
        onClear={() => undefined}
        clearLabel="Clear"
        onSearch={onSearch}
        submitLabel="Search"
      />
    );
    expect(clear).toBeEnabled();
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Enter' });
    expect(onSearch).toHaveBeenCalledWith('Dune');
  });
});

describe('NumberField', () => {
  const setup = (value: number | null = 5) => {
    const onChange = vi.fn();
    render(
      <NumberField
        label="Limit"
        value={value}
        onChange={onChange}
        min={0}
        max={10}
        step={0.5}
        decrementLabel="Decrease"
        incrementLabel="Increase"
      />
    );
    return { onChange, input: screen.getByLabelText('Limit') };
  };

  it('steps by its step and clamps', () => {
    const { onChange } = setup(9.5);
    fireEvent.click(screen.getByRole('button', { name: 'Increase' }));
    expect(onChange).toHaveBeenLastCalledWith(10);
    fireEvent.click(screen.getByRole('button', { name: 'Decrease' }));
    expect(onChange).toHaveBeenLastCalledWith(9);
  });

  it('commits typed text when editing ends: clamped, empty as null, unreadable reverted', () => {
    const { onChange, input } = setup();
    const type = (text: string) => {
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: text } });
      fireEvent.blur(input);
    };
    type('42');
    expect(onChange).toHaveBeenLastCalledWith(10);
    type('');
    expect(onChange).toHaveBeenLastCalledWith(null);
    onChange.mockClear();
    type('lots');
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue('5');
  });

  it('leaves a value off its step alone when the field is left or Enter pressed without an edit', () => {
    const onChange = vi.fn();
    render(<NumberField label="Ratio" value={0.125} onChange={onChange} step={0.01} />);
    const input = screen.getByLabelText('Ratio');
    fireEvent.focus(input);
    fireEvent.blur(input);
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '0.125' } });
    fireEvent.change(input, { target: { value: '0.126' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith(0.13);
  });
});

describe('Checkbox', () => {
  it('is a native checkbox named by its label, toggled by a press on the label', () => {
    const onCheckedChange = vi.fn();
    render(
      <Checkbox
        label="Download all seasons"
        description="Includes specials."
        error="Required."
        checked={false}
        onCheckedChange={onCheckedChange}
      />
    );
    const box = screen.getByRole('checkbox', { name: 'Download all seasons' });
    expect(box).toHaveAccessibleDescription('Includes specials. Required.');
    expect(box).toHaveAttribute('aria-invalid', 'true');
    fireEvent.click(screen.getByText('Download all seasons'));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('is mixed when indeterminate and shows virtual focus on the whole choice', () => {
    render(
      <Checkbox label="All" checked={false} indeterminate focused onCheckedChange={() => {}} />
    );
    const box = screen.getByRole('checkbox') as HTMLInputElement;
    expect(box.indeterminate).toBe(true);
    const choice = box.closest('label');
    expect(choice).toHaveAttribute('data-mixed');
    expect(choice).toHaveAttribute('data-focused');
  });
});

describe('Switch', () => {
  it('is a switch named by its label that flips on activation', () => {
    const onCheckedChange = vi.fn();
    const onPointerFocus = vi.fn();
    render(
      <Switch
        label="Episode syncing"
        checked
        onCheckedChange={onCheckedChange}
        onPointerFocus={onPointerFocus}
      />
    );
    const control = screen.getByRole('switch', { name: 'Episode syncing' });
    expect(control).toHaveAttribute('aria-checked', 'true');
    fireEvent.mouseMove(control);
    expect(onPointerFocus).toHaveBeenCalled();
    fireEvent.click(screen.getByText('Episode syncing'));
    expect(onCheckedChange).toHaveBeenCalledWith(false);
  });
});

describe('RadioGroup', () => {
  it('is a named group where focus never selects and a press does', () => {
    const onChange = vi.fn();
    const onPointerFocus = vi.fn();
    render(
      <RadioGroup
        label="Quality"
        options={[
          { value: 'hd', label: 'HD' },
          { value: 'sd', label: 'SD' },
          { value: 'uhd', label: '4K', disabled: true },
        ]}
        value="hd"
        onChange={onChange}
        focusedValue="sd"
        onPointerFocus={onPointerFocus}
      />
    );
    expect(screen.getByRole('group', { name: 'Quality' })).toBeInTheDocument();
    const sd = screen.getByRole('radio', { name: 'SD' });
    expect(sd.closest('label')).toHaveAttribute('data-focused');
    expect(sd).not.toBeChecked();
    expect(screen.getByRole('radio', { name: '4K' })).toBeDisabled();
    fireEvent.mouseMove(sd);
    expect(onPointerFocus).toHaveBeenCalledWith('sd');
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(sd);
    expect(onChange).toHaveBeenCalledWith('sd');
  });
});

describe('IconButton tooltip', () => {
  it('opens with virtual focus and describes only when it adds to the name', () => {
    const { rerender } = render(<IconButton label="Mute" icon={<Icon />} tooltip="Mute" />);
    const button = screen.getByRole('button', { name: 'Mute' });
    const anchor = button.parentElement as HTMLElement;
    expect(anchor).not.toHaveAttribute('data-open');
    expect(button).not.toHaveAttribute('aria-describedby');
    rerender(<IconButton label="Mute" icon={<Icon />} tooltip="Mute sound (M)" focused />);
    expect(anchor).toHaveAttribute('data-open');
    expect(button).toHaveAccessibleDescription('Mute sound (M)');
  });

  it('hides on Escape without letting it through, until focus returns', () => {
    const back = vi.fn();
    window.addEventListener('keydown', back);
    const { rerender } = render(<IconButton label="Mute" icon={<Icon />} tooltip="Mute" focused />);
    const anchor = screen.getByRole('button').parentElement as HTMLElement;
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(anchor).not.toHaveAttribute('data-open');
    expect(back).not.toHaveBeenCalled();
    // Escape again is Back as usual
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(back).toHaveBeenCalledTimes(1);
    rerender(<IconButton label="Mute" icon={<Icon />} tooltip="Mute" />);
    rerender(<IconButton label="Mute" icon={<Icon />} tooltip="Mute" focused />);
    expect(anchor).toHaveAttribute('data-open');
    window.removeEventListener('keydown', back);
  });
});

describe('IconButtonGroup', () => {
  const items = [
    { id: 'list', label: 'My list', icon: <Icon /> },
    { id: 'like', label: 'Like', icon: <Icon />, description: 'I like this' },
    { id: 'download', label: 'Download', icon: <Icon />, disabled: true },
  ];

  it("shows the focused button's description in the shared slot, empty otherwise", () => {
    const onPointerFocus = vi.fn();
    const { rerender } = render(
      <IconButtonGroup label="Title actions" items={items} onPointerFocus={onPointerFocus} />
    );
    const group = screen.getByRole('group', { name: 'Title actions' });
    const slot = group.nextElementSibling as HTMLElement;
    expect(slot).toHaveTextContent('');
    fireEvent.mouseMove(screen.getByRole('button', { name: 'Like' }));
    expect(onPointerFocus).toHaveBeenCalledWith('like');
    rerender(<IconButtonGroup label="Title actions" items={items} focusedId="like" />);
    expect(slot).toHaveTextContent('I like this');
    expect(screen.getByRole('button', { name: 'Like' })).toHaveAccessibleDescription('I like this');
    rerender(<IconButtonGroup label="Title actions" items={items} focusedId="list" />);
    expect(slot).toHaveTextContent('My list');
    expect(screen.getByRole('button', { name: 'My list' })).not.toHaveAttribute('aria-describedby');
    rerender(<IconButtonGroup label="Title actions" items={items} focusedId="download" />);
    expect(slot).toHaveTextContent('');
  });
});

describe('List and ListItem', () => {
  it('takes its semantics from its props, with actions as siblings of the primary part', () => {
    const onClick = vi.fn();
    render(
      <List label="Servers">
        <ListItem
          title="Home"
          onClick={onClick}
          trailing={<IconButton label="Remove" icon={<Icon />} />}
        />
        <ListItem title="Notes" href="#notes" />
        <ListItem title="Passive" />
      </List>
    );
    expect(screen.getByRole('list', { name: 'Servers' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    const home = screen.getByRole('button', { name: 'Home' });
    const remove = screen.getByRole('button', { name: 'Remove' });
    expect(home.contains(remove)).toBe(false);
    fireEvent.click(home);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Notes' })).toHaveAttribute('href', '#notes');
    expect(screen.queryByRole('button', { name: 'Passive' })).toBeNull();
  });

  it('shows virtual focus and selection on the row, and ignores the pointer over its actions', () => {
    const onPointerFocus = vi.fn();
    render(
      <ListItem
        title="Home"
        selected
        focused
        onClick={() => undefined}
        onPointerFocus={onPointerFocus}
        trailing={<IconButton label="Remove" icon={<Icon />} />}
      />
    );
    const button = screen.getByRole('button', { name: 'Home' });
    const row = button.parentElement as HTMLElement;
    expect(row).toHaveAttribute('data-focused');
    expect(row).toHaveAttribute('data-selected');
    expect(button).toHaveAttribute('aria-current', 'true');
    expect(row).not.toHaveAttribute('role');
    fireEvent.mouseMove(screen.getByRole('button', { name: 'Remove' }));
    expect(onPointerFocus).not.toHaveBeenCalled();
    fireEvent.mouseMove(button);
    expect(onPointerFocus).toHaveBeenCalledTimes(1);
  });
});

describe('SettingRow', () => {
  it('names its control with the title and its own text, and describes it', () => {
    render(
      <SettingRow
        title="Preferred quality"
        description="Used when several sources are available."
        value="1080p"
        control={props => <Button {...props}>Change</Button>}
      />
    );
    const change = screen.getByRole('button', { name: 'Preferred quality Change' });
    expect(change).toHaveAccessibleDescription('Used when several sources are available.');
    expect(screen.getByText('1080p')).toBeInTheDocument();
  });

  it('is a Switch named by the title for a boolean setting', () => {
    const onCheckedChange = vi.fn();
    render(<SettingRow title="Episode syncing" toggle={{ checked: false, onCheckedChange }} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Episode syncing' }));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });
});

describe('Message', () => {
  it('announces only when asked, with its tone as an icon and optionally in words', () => {
    const { rerender } = render(<Message tone="danger">Sign-in failed.</Message>);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    rerender(
      <Message tone="danger" live="assertive" toneLabel="Error" title="Sign-in failed">
        Check your password.
      </Message>
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('data-tone', 'danger');
    expect(screen.getByRole('img', { name: 'Error' })).toBeInTheDocument();
    rerender(<Message live="polite">Saved.</Message>);
    expect(screen.getByRole('status')).toHaveTextContent('Saved.');
  });
});

describe('Dialog', () => {
  const renderDialog = (props: Partial<React.ComponentProps<typeof Dialog>> = {}) =>
    render(
      <Dialog
        open
        title="Remove server?"
        description="Its sources go too."
        actions={<Button>Keep it</Button>}
        {...props}
      />
    );

  it('is a labelled, described modal in a portal that takes DOM focus and gives it back', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const { rerender } = renderDialog();
    const dialog = screen.getByRole('dialog', { name: 'Remove server?' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('Its sources go too.');
    expect(dialog).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');
    rerender(<Dialog open={false} title="Remove server?" actions={null} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
    expect(document.body.style.overflow).toBe('');
    opener.remove();
  });

  it('under a navigation layer, gives DOM focus to what the layer restored once the page is live', async () => {
    // jsdom lays nothing out: give every element a box, so the navigation layer can focus it
    vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(
      () => [{}] as unknown as DOMRectList
    );
    // jsdom ignores `inert`: refuse focus inside it, as browsers do
    const focus = HTMLElement.prototype.focus;
    const refuseInert = vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (
      this: HTMLElement,
      options?: FocusOptions
    ) {
      if (!this.closest('[inert]')) focus.call(this, options);
    });
    // As Home opens the Trakt dialog: inside the page's navigation, over a card that has focus
    function Page() {
      const [open, setOpen] = useState(false);
      return (
        <NavigationProvider>
          <FocusScope>
            <main>
              <Button navId="card" onClick={() => setOpen(true)}>
                Card
              </Button>
            </main>
            <Dialog
              open={open}
              title="Connect"
              actions={<Button navId="begin">Begin</Button>}
              onDismiss={() => setOpen(false)}
            />
          </FocusScope>
        </NavigationProvider>
      );
    }
    try {
      render(<Page />);
      const card = screen.getByRole('button', { name: 'Card' });
      expect(card).toHaveFocus();
      act(() => card.click());
      expect(screen.getByRole('button', { name: 'Begin' })).toHaveFocus();
      await act(async () => {
        fireEvent.keyDown(document, { key: 'Escape' });
        await Promise.resolve();
      });
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(card).toHaveAttribute('data-focused');
      expect(card).toHaveFocus();
    } finally {
      vi.mocked(Element.prototype.getClientRects).mockRestore();
      refuseInert.mockRestore();
    }
  });

  it('dismisses on Back, the scrim and the close button only when dismissible', () => {
    const onDismiss = vi.fn();
    const { rerender } = renderDialog();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    rerender(
      <Dialog open title="Remove server?" actions={null} onDismiss={onDismiss} closeLabel="Close" />
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onDismiss).toHaveBeenCalledTimes(3);
  });

  it('leaves Back to a field in edit mode and to the topmost dialog', () => {
    const outer = vi.fn();
    const inner = vi.fn();
    render(
      <>
        <Dialog open title="Outer" actions={null} onDismiss={outer} />
        <Dialog open title="Inner" actions={<input aria-label="Name" />} onDismiss={inner} />
      </>
    );
    const input = screen.getByRole('textbox', { name: 'Name' });
    input.focus();
    fireEvent.keyDown(input, { key: 'Backspace' });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(inner).not.toHaveBeenCalled();
    input.blur();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });
});

describe('Select', () => {
  const items = [
    { value: 'auto', label: 'Automatic' },
    { value: '4k', label: '4K', disabled: true },
    { value: 'hd', label: '1080p' },
  ];

  it('native: a labelled platform select showing the chosen label', () => {
    const onChange = vi.fn();
    render(<Select label="Quality" mode="native" items={items} value="auto" onChange={onChange} />);
    const select = screen.getByRole('combobox', { name: 'Quality' });
    expect(screen.getByText('Automatic', { selector: 'span' })).toBeInTheDocument();
    fireEvent.change(select, { target: { value: 'hd' } });
    expect(onChange).toHaveBeenCalledWith('hd');
  });

  it('popup: owns the keys while open, skips disabled options, chooses and closes', () => {
    const onChange = vi.fn();
    const onOpenChange = vi.fn();
    const outside = vi.fn();
    window.addEventListener('keydown', outside);
    render(
      <Select
        label="Quality"
        mode="popup"
        items={items}
        value="auto"
        onChange={onChange}
        onOpenChange={onOpenChange}
      />
    );
    const trigger = screen.getByRole('button', { name: 'Quality Automatic' });
    fireEvent.click(trigger);
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    const listbox = screen.getByRole('listbox', { name: 'Quality' });
    expect(listbox).toHaveFocus();
    expect(screen.getByRole('option', { name: 'Automatic' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    const hd = screen.getByRole('option', { name: '1080p' });
    expect(hd).toHaveAttribute('data-active');
    expect(listbox).toHaveAttribute('aria-activedescendant', hd.id);
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('hd');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(trigger).toHaveFocus();
    expect(outside).not.toHaveBeenCalled();
    window.removeEventListener('keydown', outside);
  });

  it('popup: Back and a press outside close without changing the value', () => {
    const onChange = vi.fn();
    render(<Select label="Quality" mode="popup" items={items} value="auto" onChange={onChange} />);
    const trigger = screen.getByRole('button', { name: 'Quality Automatic' });
    fireEvent.click(trigger);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.click(trigger);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('option', { name: '4K' }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('Progress', () => {
  it('spinner: a status when labelled, hidden when decorative', () => {
    const { rerender, container } = render(<ProgressSpinner label="Loading sources" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading sources');
    rerender(<ProgressSpinner decorative />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('bar: a clamped progressbar filled by transform', () => {
    const { container, rerender } = render(
      <ProgressBar label="Downloading" value={1.4} valueText="Done" />
    );
    const bar = screen.getByRole('progressbar', { name: 'Downloading' });
    expect(bar).toHaveAttribute('aria-valuenow', '100');
    expect(bar).toHaveAttribute('aria-valuetext', 'Done');
    rerender(<ProgressBar decorative value={0.25} />);
    expect(screen.queryByRole('progressbar')).toBeNull();
    const fill = container.querySelector('[style]') as HTMLElement;
    expect(fill.style.transform).toBe('scaleX(0.25)');
  });

  it('is what a busy button shows, without a second announcement', () => {
    render(<Button loading>Save</Button>);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('aria-busy', 'true');
  });
});

describe('EmptyState', () => {
  it('is a named region with its heading, body and actions', () => {
    render(
      <EmptyState
        heading="Nothing downloaded yet"
        headingLevel={3}
        actions={<Button>Browse</Button>}
      >
        Downloads show up here.
      </EmptyState>
    );
    expect(screen.getByRole('region', { name: 'Nothing downloaded yet' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: 'Nothing downloaded yet' })
    ).toBeInTheDocument();
    expect(screen.getByText('Downloads show up here.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Browse' })).toBeInTheDocument();
  });
});

describe('Tabs', () => {
  const items = [
    { id: 'a', label: 'Profile' },
    { id: 'b', label: 'Privacy' },
  ];

  it('links tabs and panels and selects only on activation', () => {
    const onSelect = vi.fn();
    render(
      <>
        <Tabs
          id="t"
          label="Sections"
          items={items}
          selectedId="a"
          focusedId="b"
          onSelect={onSelect}
        />
        <TabPanel tabsId="t" tab="a" selected>
          First
        </TabPanel>
        <TabPanel tabsId="t" tab="b" selected={false}>
          Second
        </TabPanel>
      </>
    );
    expect(screen.getByRole('tablist', { name: 'Sections' })).toHaveAttribute(
      'aria-orientation',
      'horizontal'
    );
    const profile = screen.getByRole('tab', { name: 'Profile' });
    const privacy = screen.getByRole('tab', { name: 'Privacy' });
    expect(profile).toHaveAttribute('aria-selected', 'true');
    expect(profile).toHaveAttribute('data-selected');
    expect(profile).toHaveAttribute('tabindex', '0');
    expect(privacy).toHaveAttribute('tabindex', '-1');
    expect(privacy).toHaveAttribute('data-focused');
    expect(onSelect).not.toHaveBeenCalled();

    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveAccessibleName('Profile');
    expect(profile).toHaveAttribute('aria-controls', panel.id);

    fireEvent.click(profile);
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(privacy);
    expect(onSelect).toHaveBeenCalledWith('b');
  });
});

describe('NavRail', () => {
  it('is a named landmark whose current item is separate from focus', () => {
    render(
      <NavRail label="Main" end={<NavItem icon={<Icon />} label="Settings" />}>
        <NavItem icon={<Icon />} label="Home" current />
        <NavItem icon={<Icon />} label="Inbox" focused badge="3" badgeLabel="3 unread" />
      </NavRail>
    );
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(nav).not.toHaveAttribute('data-expanded');
    const home = screen.getByRole('button', { name: 'Home' });
    expect(home).toHaveAttribute('aria-current', 'page');
    expect(home).toHaveAttribute('data-selected');
    expect(home).not.toHaveAttribute('data-focused');
    const inbox = screen.getByRole('button', { name: 'Inbox' });
    expect(inbox).toHaveAttribute('data-focused');
    expect(inbox).not.toHaveAttribute('aria-current');
    expect(inbox).toHaveAccessibleDescription('3 unread');
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
  });
});

describe('Badge', () => {
  it('is passive text in its tone, replaced by its accessible label when given', () => {
    const { container } = render(
      <>
        <Badge tone="success">Clean</Badge>
        <Badge kind="count" accessibleLabel="3 unread">
          3
        </Badge>
      </>
    );
    const [label, count] = container.querySelectorAll('[data-kind]');
    expect(label).toHaveAttribute('data-tone', 'success');
    expect(label).toHaveTextContent('Clean');
    expect(count).not.toHaveAttribute('data-tone');
    expect(screen.getByText('3')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('3 unread')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('CollectionTile', () => {
  it('is one button named by its label and described by its extras', () => {
    const onClick = vi.fn();
    const onPointerFocus = vi.fn();
    render(
      <CollectionTile
        label="The Expanse"
        supportingText="S2 · E4"
        badge={<Badge accessibleLabel="Ultra HD">4K</Badge>}
        progress={0.4}
        progressText="40% watched"
        ratio="portrait"
        labelPlacement="overlay"
        focused
        onClick={onClick}
        onPointerFocus={onPointerFocus}
      />
    );
    const tile = screen.getByRole('button', { name: 'The Expanse' });
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(tile).toHaveAccessibleDescription('S2 · E4 Ultra HD 40% watched');
    expect(tile).toHaveAttribute('type', 'button');
    expect(tile).toHaveAttribute('data-focused');
    expect(tile).toHaveAttribute('data-ratio', 'portrait');
    expect(tile).toHaveAttribute('data-label', 'overlay');
    expect(screen.queryByRole('progressbar')).toBeNull();
    fireEvent.mouseMove(tile);
    expect(onPointerFocus).toHaveBeenCalled();
    fireEvent.click(tile);
    expect(onClick).toHaveBeenCalled();
  });
});

describe('Artwork', () => {
  it('keeps its box through loading and failure, then shows the fallback', () => {
    const { container } = render(<Artwork src="/a.jpg" ratio="portrait" fallback="Arrival" />);
    const box = container.firstElementChild as HTMLElement;
    expect(box).toHaveAttribute('data-ratio', 'portrait');
    expect(box).toHaveAttribute('data-status', 'loading');
    const image = container.querySelector('img') as HTMLImageElement;
    expect(image).toHaveAttribute('alt', '');
    expect(screen.queryByText('Arrival')).toBeNull();
    fireEvent.error(image);
    expect(box).toHaveAttribute('data-status', 'failed');
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('Arrival')).toBeInTheDocument();
  });

  it('starts over when the source changes', () => {
    const { container, rerender } = render(<Artwork src="/a.jpg" />);
    fireEvent.load(container.querySelector('img') as HTMLImageElement);
    expect(container.firstElementChild).toHaveAttribute('data-status', 'loaded');
    rerender(<Artwork src="/b.jpg" />);
    expect(container.firstElementChild).toHaveAttribute('data-status', 'loading');
  });
});

describe('Avatar', () => {
  it('is a named picture over its colour, and the colour alone until it loads', () => {
    render(<Avatar name="Élodie" src="/e.png" color="#6d4aa8" placeholder="•" />);
    const avatar = screen.getByRole('img', { name: 'Élodie' });
    expect(avatar).toHaveStyle({ backgroundColor: '#6d4aa8' });
    expect(avatar).toHaveAttribute('data-status', 'loading');
    expect(avatar).toHaveTextContent('•');
    fireEvent.load(avatar.querySelector('img') as HTMLImageElement);
    expect(avatar).toHaveAttribute('data-status', 'loaded');
    expect(avatar).not.toHaveTextContent('•');
  });

  it('keeps its circle when the picture fails, and is hidden when decorative', () => {
    const { container } = render(<Avatar name="Guest" src="/g.png" decorative />);
    expect(screen.queryByRole('img')).toBeNull();
    const avatar = container.firstElementChild as HTMLElement;
    expect(avatar).toHaveAttribute('aria-hidden', 'true');
    fireEvent.error(avatar.querySelector('img') as HTMLImageElement);
    expect(avatar).toHaveAttribute('data-status', 'failed');
    expect(avatar.querySelector('img')).toBeNull();
  });

  it('keeps its colour and placeholder until a drawn picture is ready', () => {
    const picture = <canvas data-testid="drawn" />;
    const { rerender } = render(
      <Avatar name="Mia" picture={picture} pictureLoaded={false} color="#6d4aa8" placeholder="•" />
    );
    const avatar = screen.getByRole('img', { name: 'Mia' });
    expect(avatar).toHaveAttribute('data-status', 'loading');
    expect(avatar).toHaveStyle({ backgroundColor: '#6d4aa8' });
    expect(avatar).toHaveTextContent('•');
    expect(screen.getByTestId('drawn')).toBeInTheDocument();
    rerender(<Avatar name="Mia" picture={picture} pictureLoaded color="#6d4aa8" placeholder="•" />);
    expect(avatar).toHaveAttribute('data-status', 'loaded');
    expect(avatar).not.toHaveTextContent('•');
    expect(screen.getByTestId('drawn')).toBeInTheDocument();
  });
});

describe('Review fixes', () => {
  it('keeps the caller’s descriptions on fields, choices, tiles and nav items', () => {
    render(
      <>
        <p id="help">Shared help</p>
        <TextField label="Name" description="Shown on the profile" aria-describedby="help" />
        <Switch label="Sync" checked onCheckedChange={vi.fn()} aria-describedby="help" />
        <Checkbox
          label="Remember"
          checked={false}
          onCheckedChange={vi.fn()}
          aria-describedby="help"
        />
        <CollectionTile label="Dune" supportingText="2024" aria-describedby="help" />
        <NavRail label="Main">
          <NavItem
            icon={<Icon />}
            label="Inbox"
            badge="3"
            badgeLabel="3 unread"
            aria-describedby="help"
          />
        </NavRail>
      </>
    );
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveAccessibleDescription(
      'Shared help Shown on the profile'
    );
    expect(screen.getByRole('switch', { name: 'Sync' })).toHaveAccessibleDescription('Shared help');
    expect(screen.getByRole('checkbox', { name: 'Remember' })).toHaveAccessibleDescription(
      'Shared help'
    );
    expect(screen.getByRole('button', { name: 'Dune' })).toHaveAccessibleDescription(
      'Shared help 2024'
    );
    expect(screen.getByRole('button', { name: 'Inbox' })).toHaveAccessibleDescription(
      'Shared help 3 unread'
    );
  });

  it('checks a mixed checkbox and keeps it mixed while the owner says so', () => {
    const onCheckedChange = vi.fn();
    render(<Checkbox label="All" checked indeterminate onCheckedChange={onCheckedChange} />);
    const box = screen.getByRole('checkbox', { name: 'All' }) as HTMLInputElement;
    expect(box.indeterminate).toBe(true);
    fireEvent.click(box);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
    expect(box.indeterminate).toBe(true);
  });

  it('links radio descriptions whatever characters the values hold', () => {
    render(
      <RadioGroup
        label="Audio"
        value="original audio"
        onChange={vi.fn()}
        options={[{ value: 'original audio', label: 'Original', description: 'As released' }]}
      />
    );
    expect(screen.getByRole('radio', { name: 'Original' })).toHaveAccessibleDescription(
      'As released'
    );
  });

  it('steps by exponent-notation steps and never commits a read-only field', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <NumberField
        label="Offset"
        value={0}
        step={1e-7}
        onChange={onChange}
        decrementLabel="Less"
        incrementLabel="More"
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(onChange).toHaveBeenLastCalledWith(1e-7);

    onChange.mockClear();
    rerender(<NumberField label="Offset" value={1.5} readOnly onChange={onChange} />);
    const input = screen.getByRole('textbox', { name: 'Offset' });
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('never runs a disabled progress button, and disabling ends the countdown', () => {
    const onAction = vi.fn();
    const { rerender } = render(
      <ProgressButton duration={1000} focused onAction={onAction}>
        Next episode
      </ProgressButton>
    );
    const button = screen.getByRole('button', { name: 'Next episode' });
    const clip = button.lastElementChild as HTMLElement;
    rerender(
      <ProgressButton duration={1000} focused disabled onAction={onAction}>
        Next episode
      </ProgressButton>
    );
    fireEvent.animationEnd(clip);
    expect(onAction).not.toHaveBeenCalled();
    expect(button).not.toHaveAttribute('data-progress');

    render(
      <ProgressButton duration={1000} disabled onAction={onAction}>
        Skip intro
      </ProgressButton>
    );
    expect(screen.getByRole('button', { name: 'Skip intro' })).not.toHaveAttribute('data-progress');
  });

  it('keeps a described artwork named when its image fails', () => {
    const { container } = render(<Artwork src="/missing.jpg" alt="Dune poster" />);
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    expect(screen.getByRole('img', { name: 'Dune poster' })).toHaveAttribute(
      'data-status',
      'failed'
    );
  });

  it('closes a select popup on Tab, when disabled, and never confirms a removed option', () => {
    const items = [
      { value: 'en', label: 'English' },
      { value: 'it', label: 'Italian' },
    ];
    const onChange = vi.fn();
    const props = { label: 'Audio', mode: 'popup' as const, value: null, onChange };
    const { rerender } = render(<Select {...props} items={items} />);
    const trigger = screen.getByRole('button', { name: /^Audio/ });

    fireEvent.click(trigger);
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(screen.queryByRole('listbox')).toBeNull();

    fireEvent.click(trigger);
    rerender(<Select {...props} items={items} disabled />);
    expect(screen.queryByRole('listbox')).toBeNull();

    rerender(<Select {...props} items={items} />);
    fireEvent.click(trigger);
    // English is active; it goes away while the popup is open
    rerender(<Select {...props} items={[{ ...items[0], disabled: true }, items[1]]} />);
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('it');
  });

  it('shares the scroll lock and focus between stacked dialogs, and leaves the rest inert', () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    document.body.style.overflow = 'auto';
    const dialog = (title: string, open: boolean) => (
      <Dialog open={open} title={title} actions={<Button>OK</Button>} />
    );
    const { rerender } = render(
      <>
        {dialog('First', true)}
        {dialog('Second', false)}
      </>
    );
    expect(document.body.style.overflow).toBe('hidden');
    expect(outside).toHaveAttribute('inert');

    rerender(
      <>
        {dialog('First', true)}
        {dialog('Second', true)}
      </>
    );
    const second = screen.getByRole('dialog', { name: 'Second' });
    expect(second).toHaveFocus();
    expect(screen.getByRole('dialog', { name: 'First' }).parentElement).toHaveAttribute('inert');

    // The underlying dialog closes first: the lock and focus stay with the topmost
    rerender(
      <>
        {dialog('First', false)}
        {dialog('Second', true)}
      </>
    );
    expect(document.body.style.overflow).toBe('hidden');
    expect(second).toHaveFocus();
    expect(second.parentElement).not.toHaveAttribute('inert');

    rerender(
      <>
        {dialog('First', false)}
        {dialog('Second', false)}
      </>
    );
    expect(document.body.style.overflow).toBe('auto');
    expect(outside).not.toHaveAttribute('inert');
    // Second's own opener (First's panel) is gone: focus returns to the original opener
    expect(outside).toHaveFocus();
    outside.remove();
    document.body.style.overflow = '';
  });

  it('cycles Tab inside the topmost dialog, over what Tab can reach', () => {
    // jsdom lays nothing out: rendered elements get one client rect, a hidden one none
    vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(function (this: Element) {
      return (this.closest('[data-unrendered]') ? [] : [{}]) as unknown as DOMRectList;
    });
    render(
      <Dialog
        open
        title="Remove?"
        actions={
          <>
            <Button>Keep</Button>
            <Button>Remove</Button>
            <input type="hidden" name="intent" value="remove" />
            {/* After the last visible button: not rendered, out of the order, or inert */}
            <span data-unrendered>
              <Button>Hidden</Button>
            </span>
            <span tabIndex={-1}>Not in the order</span>
            <span inert>
              <Button>Inert</Button>
            </span>
          </>
        }
      />
    );
    const keep = screen.getByRole('button', { name: 'Keep' });
    const remove = screen.getByRole('button', { name: 'Remove' });
    remove.focus();
    fireEvent.keyDown(remove, { key: 'Tab' });
    expect(keep).toHaveFocus();
    fireEvent.keyDown(keep, { key: 'Tab', shiftKey: true });
    expect(remove).toHaveFocus();
    vi.restoreAllMocks();
  });

  it('spends Escape on a tooltip before the dialog around it', () => {
    const onDismiss = vi.fn();
    render(
      <Dialog
        open
        title="Player"
        onDismiss={onDismiss}
        actions={
          <IconButton label="Subtitles" icon={<Icon />} tooltip="Choose a language" focused />
        }
      />
    );
    fireEvent.keyDown(document.activeElement ?? document, { key: 'Escape' });
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.keyDown(document.activeElement ?? document, { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('keeps a nested dialog open from the start above its parent', () => {
    const onDismissOuter = vi.fn();
    const onDismissInner = vi.fn();
    render(
      <Dialog open title="Outer" onDismiss={onDismissOuter} actions={<Button>OK</Button>}>
        <Dialog open title="Inner" onDismiss={onDismissInner} actions={<Button>OK</Button>} />
      </Dialog>
    );
    const inner = screen.getByRole('dialog', { name: 'Inner' });
    expect(inner).toHaveFocus();
    expect(inner.parentElement).not.toHaveAttribute('inert');
    expect(screen.getByRole('dialog', { name: 'Outer' }).parentElement).toHaveAttribute('inert');
    // Paints above its parent, though its portal was added to the body first
    expect(Number(inner.parentElement?.style.zIndex)).toBeGreaterThan(
      Number(screen.getByRole('dialog', { name: 'Outer' }).parentElement?.style.zIndex)
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onDismissInner).toHaveBeenCalledTimes(1);
    expect(onDismissOuter).not.toHaveBeenCalled();
  });

  it('restores focus to the next candidate when the opener cannot take it', () => {
    const ui = (secondOpen: boolean, openerDisabled: boolean) => (
      <>
        <Dialog
          open
          title="First"
          actions={<Button disabled={openerDisabled}>Open second</Button>}
        />
        <Dialog open={secondOpen} title="Second" actions={<Button>OK</Button>} />
      </>
    );
    const { rerender } = render(ui(false, false));
    screen.getByRole('button', { name: 'Open second' }).focus();
    rerender(ui(true, false));
    expect(screen.getByRole('dialog', { name: 'Second' })).toHaveFocus();
    // The opener becomes disabled while Second is open: focus falls back to First's panel
    rerender(ui(true, true));
    rerender(ui(false, true));
    expect(screen.getByRole('dialog', { name: 'First' })).toHaveFocus();
  });

  it('makes content added behind an open dialog inert, and releases it', async () => {
    const { rerender } = render(<Dialog open title="Remove?" actions={<Button>OK</Button>} />);
    const late = document.createElement('div');
    document.body.appendChild(late);
    // MutationObserver callbacks run as a microtask
    await Promise.resolve();
    expect(late).toHaveAttribute('inert');
    rerender(<Dialog open={false} title="Remove?" actions={<Button>OK</Button>} />);
    expect(late).not.toHaveAttribute('inert');
    late.remove();
  });

  it('runs a progress button’s action at most once', () => {
    const onAction = vi.fn();
    render(
      <ProgressButton duration={1000} focused onAction={onAction}>
        Next episode
      </ProgressButton>
    );
    const button = screen.getByRole('button', { name: 'Next episode' });
    fireEvent.animationEnd(button.lastElementChild as HTMLElement);
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onAction).toHaveBeenCalledTimes(1);

    const onSkip = vi.fn();
    render(
      <ProgressButton duration={1000} focused onAction={onSkip}>
        Skip intro
      </ProgressButton>
    );
    // An arrow ends the countdown; the first press still runs the action
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    const skip = screen.getByRole('button', { name: 'Skip intro' });
    fireEvent.click(skip);
    fireEvent.click(skip);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('never selects a radio on an arrow key', () => {
    const onChange = vi.fn();
    render(
      <RadioGroup
        label="Quality"
        value="auto"
        onChange={onChange}
        options={[
          { value: 'auto', label: 'Auto' },
          { value: 'hd', label: 'HD' },
        ]}
      />
    );
    const auto = screen.getByRole('radio', { name: 'Auto' });
    // fireEvent returns false when the default action was cancelled
    expect(fireEvent.keyDown(auto, { key: 'ArrowDown' })).toBe(false);
    expect(fireEvent.keyDown(auto, { key: 'Enter' })).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('adds tooltip and group descriptions to the caller’s', () => {
    render(
      <>
        <p id="warning">Deletes the file</p>
        <IconButton
          label="Delete"
          icon={<Icon />}
          tooltip="Delete download"
          aria-describedby="warning"
        />
        <IconButtonGroup
          label="Actions"
          focusedId="remove"
          items={[
            {
              id: 'remove',
              label: 'Remove',
              icon: <Icon />,
              description: 'Remove from list',
              'aria-describedby': 'warning',
            },
          ]}
        />
      </>
    );
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveAccessibleDescription(
      'Deletes the file Delete download'
    );
    expect(screen.getByRole('button', { name: 'Remove' })).toHaveAccessibleDescription(
      'Deletes the file Remove from list'
    );
  });

  it('names a list row by its title and marks a passive current row', () => {
    render(
      <List label="Episodes">
        <ListItem
          title="Pilot"
          description="A long synopsis"
          metadata="42 min"
          onClick={() => undefined}
        />
        <ListItem title="Notes" description="Read me" href="#notes" />
        <ListItem title="Playing" selected />
      </List>
    );
    expect(screen.getByRole('button', { name: 'Pilot' })).toHaveAccessibleDescription(
      'A long synopsis 42 min'
    );
    expect(screen.getByRole('link', { name: 'Notes' })).toHaveAccessibleDescription('Read me');
    expect(screen.getByText('Playing').closest('[aria-current]')).toHaveAttribute(
      'aria-current',
      'true'
    );
  });

  it('shows the placeholder natively too when the value is not among the items', () => {
    render(
      <Select
        label="Audio"
        mode="native"
        placeholder="Choose"
        value="en"
        onChange={() => undefined}
        items={[{ value: 'it', label: 'Italian' }]}
      />
    );
    const select = screen.getByRole('combobox', { name: 'Audio' }) as HTMLSelectElement;
    expect(select.value).toBe('');
    expect(select.selectedOptions[0]).toHaveTextContent('Choose');
  });
});

describe('Chip', () => {
  it('is passive text, a toggle, or two sibling actions', () => {
    const onSelectedChange = vi.fn();
    const onRemove = vi.fn();
    const onClick = vi.fn();
    render(
      <>
        <Chip>Drama</Chip>
        <FilterChip selected={false} focused onSelectedChange={onSelectedChange}>
          4K
        </FilterChip>
        <RemovableChip
          removeLabel="Remove dune"
          onRemove={onRemove}
          onClick={onClick}
          focusedPart="remove"
        >
          dune
        </RemovableChip>
      </>
    );
    expect(screen.queryByRole('button', { name: 'Drama' })).toBeNull();
    const filter = screen.getByRole('button', { name: '4K' });
    expect(filter).toHaveAttribute('aria-pressed', 'false');
    expect(filter).toHaveAttribute('data-focused');
    fireEvent.click(filter);
    expect(onSelectedChange).toHaveBeenCalledWith(true);

    const body = screen.getByRole('button', { name: 'dune' });
    const remove = screen.getByRole('button', { name: 'Remove dune' });
    expect(body.contains(remove)).toBe(false);
    expect(body).not.toHaveAttribute('data-focused');
    expect(remove).toHaveAttribute('data-focused');
    fireEvent.click(body);
    expect(onClick).toHaveBeenCalled();
    fireEvent.click(remove);
    expect(onRemove).toHaveBeenCalled();
  });

  it('has a passive body when nothing runs from it', () => {
    render(
      <RemovableChip removeLabel="Remove dune" onRemove={vi.fn()}>
        dune
      </RemovableChip>
    );
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});

describe('Menu', () => {
  const items = [
    { id: 'a', label: 'Edit' },
    { id: 'b', label: 'Manage', disabled: true },
    { type: 'separator' as const, id: 's' },
    { id: 'c', label: 'Sign out' },
  ];

  it('steps over disabled actions and separators, clamping at the ends', () => {
    expect(stepAction(items, null, 1)).toBe('a');
    expect(stepAction(items, 'a', 1)).toBe('c');
    expect(stepAction(items, 'c', 1)).toBe('c');
    expect(stepAction(items, 'c', -1)).toBe('a');
    expect(stepAction(items, 'a', -1)).toBe('a');
  });

  it('opens from its trigger, runs an action and closes', () => {
    const onAction = vi.fn();
    render(
      <Menu
        label="Profile actions"
        items={items}
        onAction={onAction}
        trigger={props => (
          <button type="button" {...props}>
            More
          </button>
        )}
      />
    );
    const trigger = screen.getByRole('button', { name: 'More' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    const menu = screen.getByRole('menu', { name: 'Profile actions' });
    expect(trigger).toHaveAttribute('aria-controls', menu.id);
    expect(screen.getByRole('separator')).toBeInTheDocument();
    const edit = screen.getByRole('menuitem', { name: 'Edit' });
    expect(menu).toHaveAttribute('aria-activedescendant', edit.id);

    fireEvent.click(screen.getByRole('menuitem', { name: 'Manage' }));
    expect(onAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    expect(onAction).toHaveBeenCalledWith('c');
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('Carousel', () => {
  it('keeps the collection geometry in step with Home', () => {
    for (const size of [
      { width: 1920, height: 1080 },
      { width: 1280, height: 720 },
      { width: 390, height: 844 },
    ]) {
      const home = mediaBoxSizes(size);
      expect(collectionGeometry(size)).toEqual({
        itemWidth: home.mediaWidth,
        gap: home.gap,
        perPage: home.mediaPerPage,
        peek: home.peekWidth,
        contentWidth: home.width,
      });
    }
  });

  it('moves one item into the leading slot, keeping the last page full, and exits at the ends', () => {
    const layout = { count: 10, perPage: 4, paging: 'item' as const };
    expect(stepCarousel({ focused: 0, leading: 0 }, -1, layout)).toBeNull();
    expect(stepCarousel({ focused: 0, leading: 0 }, 1, layout)).toEqual({ focused: 1, leading: 1 });
    expect(stepCarousel({ focused: 7, leading: 6 }, 1, layout)).toEqual({ focused: 8, leading: 6 });
    expect(stepCarousel({ focused: 9, leading: 6 }, 1, layout)).toBeNull();
    // Back from the end, the track waits until focus reaches the leading slot
    expect(stepCarousel({ focused: 9, leading: 6 }, -1, layout)).toEqual({
      focused: 8,
      leading: 6,
    });
    expect(stepCarousel({ focused: 6, leading: 6 }, -1, layout)).toEqual({
      focused: 5,
      leading: 5,
    });
  });

  it('pages and focuses the leading item, then steps to the end', () => {
    const layout = { count: 10, perPage: 4, paging: 'page' as const };
    expect(stepCarousel({ focused: 2, leading: 0 }, 1, layout)).toEqual({ focused: 4, leading: 4 });
    expect(stepCarousel({ focused: 4, leading: 4 }, 1, layout)).toEqual({ focused: 6, leading: 6 });
    expect(stepCarousel({ focused: 6, leading: 6 }, 1, layout)).toEqual({ focused: 7, leading: 6 });
    expect(stepCarousel({ focused: 9, leading: 6 }, 1, layout)).toBeNull();
    expect(stepCarousel({ focused: 1, leading: 0 }, -1, layout)).toEqual({
      focused: 0,
      leading: 0,
    });
  });

  it('reveals a remembered item, moving the track only when it is out of view', () => {
    const layout = { count: 10, perPage: 4, paging: 'item' as const };
    expect(revealItem({ focused: 0, leading: 0 }, 2, layout)).toEqual({ focused: 2, leading: 0 });
    expect(revealItem({ focused: 0, leading: 0 }, 9, layout)).toEqual({ focused: 9, leading: 6 });
  });

  it('clamps the leading item when the count shrinks or the page grows', () => {
    const layout = { count: 5, perPage: 4, paging: 'item' as const };
    expect(revealItem({ focused: 4, leading: 6 }, 4, layout)).toEqual({ focused: 4, leading: 1 });
    expect(revealItem({ focused: 1, leading: 3 }, 1, layout)).toEqual({ focused: 1, leading: 1 });
  });

  it('mounts the items near the visible ones and locks the pointer while the track moves', () => {
    vi.useFakeTimers();
    const geometry = { itemWidth: 100, gap: 10, perPage: 3, peek: 50, contentWidth: 320 };
    const onPointerFocus = vi.fn();
    const renderItem = (index: number) => <span>{`Item ${index}`}</span>;
    const props = { label: 'Row', count: 40, geometry, renderItem, onPointerFocus };
    const { rerender } = render(<Carousel {...props} focusedIndex={0} leadingIndex={0} />);
    expect(screen.getByRole('region', { name: 'Row' })).toHaveAttribute(
      'aria-roledescription',
      'carousel'
    );
    // The visible page and one page beyond it
    expect(screen.getAllByRole('listitem')).toHaveLength(6);

    const slot = () => screen.getByText('Item 4').parentElement as HTMLElement;
    rerender(<Carousel {...props} focusedIndex={4} leadingIndex={4} />);
    expect(slot()).toHaveAttribute('aria-posinset', '5');
    expect(screen.getByRole('list').style.transform).toBe('translateX(-440px)');
    fireEvent.mouseMove(slot(), { clientX: 10, clientY: 10 });
    expect(onPointerFocus).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500);
    // The same coordinates after the scroll: content stopped under a resting pointer
    fireEvent.mouseMove(slot(), { clientX: 10, clientY: 10 });
    expect(onPointerFocus).not.toHaveBeenCalled();
    fireEvent.mouseMove(slot(), { clientX: 12, clientY: 10 });
    expect(onPointerFocus).toHaveBeenCalledWith(4);
    vi.useRealTimers();
  });
});

describe('Skeleton', () => {
  it('draws placeholder geometry hidden from assistive technology', () => {
    const { container } = render(
      <SkeletonGroup>
        <Skeleton shape="box" ratio="portrait" />
        <Skeleton shape="text" type="heading" lines={3} width="12rem" />
        <Skeleton shape="circle" size="lg" />
      </SkeletonGroup>
    );
    const group = container.firstElementChild as HTMLElement;
    expect(group).toHaveAttribute('aria-hidden', 'true');
    const [box, text, circle] = Array.from(group.children) as HTMLElement[];
    expect(box).toHaveAttribute('data-ratio', 'portrait');
    expect(text).toHaveAttribute('data-type', 'heading');
    expect(text.style.width).toBe('12rem');
    expect(text.children).toHaveLength(3);
    expect(circle).toHaveAttribute('data-size', 'lg');
  });

  it('takes the fill over media from the surface', () => {
    const { container } = render(
      <SurfaceContextProvider value="overMedia">
        <Skeleton shape="box" height="3rem" />
      </SurfaceContextProvider>
    );
    const box = container.firstElementChild as HTMLElement;
    expect(box).toHaveAttribute('data-surface', 'overMedia');
    expect(box).toHaveAttribute('aria-hidden', 'true');
    expect(box.style.height).toBe('3rem');
  });
});

describe('Slider', () => {
  it('snaps to the step grid and clamps at the limits', () => {
    const range = { min: 0, max: 10, step: 0.1 };
    expect(stepSliderValue(0.2, 1, range)).toBe(0.3);
    expect(stepSliderValue(9.95, 1, range)).toBe(10);
    expect(stepSliderValue(0, -1, range)).toBe(0);
    expect(stepSliderValue(5, 1, range, 2)).toBe(7);
    // The highest value on the grid when the maximum is off it
    expect(snapSliderValue(100, { min: 0, max: 10, step: 3 })).toBe(9);
    expect(snapSliderValue(Number.NaN, range)).toBe(0);
  });

  it('finds the top of the grid without floating-point drift', () => {
    expect(snapSliderValue(1, { min: 0, max: 0.3, step: 0.1 })).toBe(0.3);
    expect(snapSliderValue(9, { min: 0.5, max: 2.5, step: 1 })).toBe(2.5);
    expect(stepSliderValue(1.5, 1, { min: 0.5, max: 2.5, step: 1 })).toBe(2.5);
  });

  it('never tops a maximum just below a grid point, and reads steps in exponent notation', () => {
    // 0.2999999999 / 0.1 rounds to 3 at nine decimals; 0.3 is above the maximum
    expect(snapSliderValue(1, { min: 0, max: 0.2999999999, step: 0.1 })).toBe(0.2);
    expect(snapSliderValue(0.25, { min: 0, max: 1, step: 1e-7 })).toBe(0.25);
    expect(snapSliderValue(0.00000034, { min: 0, max: 1, step: 1e-7 })).toBe(0.0000003);
    expect(snapSliderValue(0.0000002, { min: 0, max: 1, step: 1.5e-7 })).toBe(0.00000015);
  });

  it('owns Left/Right while focused, clamping instead of exiting, and leaves Up/Down', () => {
    const onChange = vi.fn();
    const outside = vi.fn();
    window.addEventListener('keydown', outside);
    const { rerender } = render(
      <Slider label="Volume" value={95} keyStep={10} valueText="95%" onChange={onChange} focused />
    );
    const slider = screen.getByRole('slider', { name: 'Volume' });
    expect(slider).toHaveAttribute('aria-valuetext', '95%');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith(100);
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith(85);
    expect(outside).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(outside).toHaveBeenCalledTimes(1);

    // At the limit the key is still the slider's, and nothing changes
    onChange.mockClear();
    rerender(<Slider label="Volume" value={100} onChange={onChange} focused />);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onChange).not.toHaveBeenCalled();
    expect(outside).toHaveBeenCalledTimes(1);

    rerender(<Slider label="Volume" value={50} onChange={onChange} />);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onChange).not.toHaveBeenCalled();
    expect(outside).toHaveBeenCalledTimes(2);
    window.removeEventListener('keydown', outside);
  });

  it('reports native changes on the grid and the pointer moving onto it', () => {
    const onChange = vi.fn();
    const onPointerFocus = vi.fn();
    render(
      <Slider
        label="Brightness"
        value={50}
        step={10}
        onChange={onChange}
        onPointerFocus={onPointerFocus}
      />
    );
    const slider = screen.getByRole('slider', { name: 'Brightness' });
    fireEvent.change(slider, { target: { value: '70' } });
    expect(onChange).toHaveBeenCalledWith(70);
    fireEvent.mouseMove(slider);
    expect(onPointerFocus).toHaveBeenCalled();
  });

  it('takes its name from a row without reading its own value', () => {
    render(
      <SettingRow
        title="Subtitle size"
        description="Every title on this profile."
        control={props => <Slider {...props} value={100} min={50} max={200} onChange={vi.fn()} />}
      />
    );
    const slider = screen.getByRole('slider', { name: 'Subtitle size' });
    expect(slider).toHaveAccessibleDescription('Every title on this profile.');
  });
});

describe('Stack and Grid', () => {
  it('lays out passively as the element it is given', () => {
    render(
      <Stack as="ul" direction="row" gap="md" align="center" aria-label="Genres">
        <li>Drama</li>
        <li>Comedy</li>
      </Stack>
    );
    const list = screen.getByRole('list', { name: 'Genres' });
    expect(list).toHaveAttribute('data-direction', 'row');
    expect(list).toHaveAttribute('data-gap', 'md');
    expect(list).toHaveAttribute('data-align', 'center');
    expect(list).not.toHaveAttribute('tabindex');
  });

  it('puts responsive columns and spans in static attributes', () => {
    const { container } = render(
      <Grid columns={{ compact: 1, expanded: 3 }} gap="sm" rowGap="lg">
        <GridItem span={{ compact: 1, expanded: 2 }}>Wide</GridItem>
        <div>Narrow</div>
      </Grid>
    );
    const grid = container.firstElementChild as HTMLElement;
    expect(grid).toHaveAttribute('data-columns', '1');
    expect(grid).toHaveAttribute('data-columns-expanded', '3');
    expect(grid).not.toHaveAttribute('data-columns-medium');
    expect(grid).toHaveAttribute('data-row-gap', 'lg');
    expect(screen.getByText('Wide')).toHaveAttribute('data-span-expanded', '2');
  });

  it('resolves a responsive value from the nearest smaller window class', () => {
    const columns = { compact: 1, expanded: 3 };
    expect(resolveResponsive(columns, 'compact')).toBe(1);
    expect(resolveResponsive(columns, 'medium')).toBe(1);
    expect(resolveResponsive(columns, 'large')).toBe(3);
    expect(resolveResponsive(4, 'medium')).toBe(4);
  });

  it('places items as CSS grid does, wrapping a span that does not fit', () => {
    expect(gridLayout([1, 2, 2, 1, 9], 4)).toEqual([
      { row: 0, column: 0, span: 1 },
      { row: 0, column: 1, span: 2 },
      { row: 1, column: 0, span: 2 },
      { row: 1, column: 2, span: 1 },
      { row: 2, column: 0, span: 4 },
    ]);
  });

  it('moves within rows, aligns across them, clamps a short row and exits at the edges', () => {
    // a b c d / space(2) e: the last row is short
    const cells = gridLayout([1, 1, 1, 1, 2, 1], 4);
    expect(stepGrid(cells, 0, 'right')).toBe(1);
    expect(stepGrid(cells, 3, 'right')).toBeNull();
    expect(stepGrid(cells, 0, 'left')).toBeNull();
    expect(stepGrid(cells, 1, 'left', { rtl: true })).toBe(2);
    // b (column 1) down lands on the space spanning columns 0 and 1
    expect(stepGrid(cells, 1, 'down')).toBe(4);
    // Back up from the space with the remembered column returns to b, not a
    expect(stepGrid(cells, 4, 'up', { column: 1 })).toBe(1);
    expect(stepGrid(cells, 4, 'up')).toBe(0);
    // d (column 3) down: nothing covers column 3, so the nearest item, e at column 2
    expect(stepGrid(cells, 3, 'down')).toBe(5);
    expect(stepGrid(cells, 5, 'down')).toBeNull();
    expect(stepGrid(cells, 0, 'up')).toBeNull();
  });
});

describe('Inline, Container and SafeArea', () => {
  it('wraps a list, dropping a row gap equal to the gap', () => {
    render(
      <Inline as="ul" gap="sm" rowGap="sm" justify="between" aria-label="Genres">
        <li>Drama</li>
      </Inline>
    );
    const list = screen.getByRole('list', { name: 'Genres' });
    expect(list).toHaveAttribute('data-gap', 'sm');
    expect(list).not.toHaveAttribute('data-row-gap');
    expect(list).toHaveAttribute('data-align', 'center');
    expect(list).toHaveAttribute('data-justify', 'between');
  });

  it('names its width and gutters, and the safe area its edges', () => {
    render(
      <SafeArea as="main" edges="x" fill>
        <Container as="section" width="form" gutters="none" aria-label="Sign in">
          Fields
        </Container>
      </SafeArea>
    );
    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('data-edges', 'x');
    expect(main).toHaveAttribute('data-fill');
    const region = screen.getByRole('region', { name: 'Sign in' });
    expect(region).toHaveAttribute('data-width', 'form');
    expect(region).toHaveAttribute('data-gutters', 'none');
  });
});

describe('ScrollArea', () => {
  it('moves as little as possible to show an item whole, clear of sticky chrome', () => {
    const base = { viewport: 500, content: 2000, itemHeight: 100, startInset: 50, margin: 20 };
    // Already visible: no move
    expect(revealOffset({ ...base, current: 0, itemTop: 200 })).toBe(0);
    // Below: its bottom over the bottom edge
    expect(revealOffset({ ...base, current: 0, itemTop: 600 })).toBe(220);
    // Above, or under the sticky header: its top under the header
    expect(revealOffset({ ...base, current: 800, itemTop: 790 })).toBe(720);
    // Clamped to the scrollable range
    expect(revealOffset({ ...base, current: 0, itemTop: 1950 })).toBe(1500);
    expect(revealOffset({ ...base, current: 300, itemTop: 10 })).toBe(0);
    // Taller than the view: its top
    expect(revealOffset({ ...base, current: 0, itemTop: 900, itemHeight: 800 })).toBe(830);
  });

  it('reveals key focus, not pointer focus, and locks the pointer while it moves', async () => {
    vi.useFakeTimers();
    const onPointerFocus = vi.fn();
    const Item = ({ id, focused }: { id: string; focused: boolean }) => (
      <div data-testid={id} data-focused={focused || undefined} onMouseMove={onPointerFocus}>
        {id}
      </div>
    );
    const { rerender } = render(
      <ScrollArea label="Settings" mode="transform">
        <Item id="first" focused />
        <Item id="far" focused={false} />
        <Item id="farther" focused={false} />
      </ScrollArea>
    );
    const area = screen.getByRole('region', { name: 'Settings' });
    const content = area.firstElementChild as HTMLElement;
    const layout = (element: HTMLElement, values: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(values)) {
        Object.defineProperty(element, key, { configurable: true, value });
      }
    };
    layout(area, { clientHeight: 400 });
    layout(content, { offsetHeight: 3000 });
    layout(screen.getByTestId('far'), {
      offsetTop: 1000,
      offsetHeight: 100,
      offsetParent: content,
    });
    layout(screen.getByTestId('farther'), {
      offsetTop: 2000,
      offsetHeight: 100,
      offsetParent: content,
    });

    fireEvent.keyDown(window, { key: 'ArrowDown' });
    rerender(
      <ScrollArea label="Settings" mode="transform">
        <Item id="first" focused={false} />
        <Item id="far" focused />
        <Item id="farther" focused={false} />
      </ScrollArea>
    );
    await act(async () => {});
    // 1000 + 100 - 400 + the lg margin (24px at 16px)
    expect(content.style.transform).toBe('translate3d(0, -724px, 0)');

    const far = screen.getByTestId('far');
    fireEvent.mouseMove(far, { clientX: 10, clientY: 10 });
    expect(onPointerFocus).not.toHaveBeenCalled();
    vi.advanceTimersByTime(400);
    // The content stopped under a resting pointer
    fireEvent.mouseMove(far, { clientX: 10, clientY: 10 });
    expect(onPointerFocus).not.toHaveBeenCalled();
    fireEvent.mouseMove(far, { clientX: 12, clientY: 10 });
    expect(onPointerFocus).toHaveBeenCalledTimes(1);

    // Focus moved by the pointer never scrolls
    rerender(
      <ScrollArea label="Settings" mode="transform">
        <Item id="first" focused={false} />
        <Item id="far" focused={false} />
        <Item id="farther" focused />
      </ScrollArea>
    );
    await act(async () => {});
    expect(content.style.transform).toBe('translate3d(0, -724px, 0)');
    vi.useRealTimers();
  });
});

describe('Section', () => {
  it('is a region named by its heading and described by its description', () => {
    render(
      <Section
        title="Servers"
        headingLevel={3}
        description="Where your library is stored."
        actions={<Button>Add server</Button>}
        padding="lg"
      >
        <p>List</p>
      </Section>
    );
    const region = screen.getByRole('region', { name: 'Servers' });
    expect(region).toHaveAccessibleDescription('Where your library is stored.');
    expect(region).toHaveAttribute('data-padding', 'lg');
    expect(screen.getByRole('heading', { level: 3, name: 'Servers' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add server' })).toBeInTheDocument();
  });
});

describe('Popover', () => {
  it('keeps a nested popover above its parent whatever order they open in', () => {
    const parent = Symbol('parent');
    const child = Symbol('child');
    // React runs the child's effects first
    const popChild = pushPopover(child, parent);
    const popParent = pushPopover(parent);
    expect(isTopPopover(child)).toBe(true);
    popChild();
    expect(isTopPopover(parent)).toBe(true);
    popParent();
  });

  const renderPopover = (
    props: Partial<Parameters<typeof Popover>[0]> & { onDismiss: () => void },
    outside?: () => void
  ) =>
    render(
      <div>
        <button type="button" onClick={outside}>
          Outside
        </button>
        <Popover
          open
          modality="modal"
          title="Audio"
          trigger={triggerProps => (
            <button type="button" {...triggerProps}>
              Tracks
            </button>
          )}
          {...props}
        >
          <input aria-label="Search tracks" />
          <button type="button">English</button>
        </Popover>
      </div>
    );

  it('is a dialog named by its title, described to its trigger, holding DOM focus', () => {
    renderPopover({ onDismiss: vi.fn() });
    const panel = screen.getByRole('dialog', { name: 'Audio' });
    expect(panel).toHaveAttribute('aria-modal', 'true');
    expect(panel).toHaveFocus();
    const trigger = screen.getByRole('button', { name: 'Tracks' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(trigger).toHaveAttribute('aria-controls', panel.id);
  });

  it('closes on Back, but not while a field inside is in edit mode', () => {
    const onDismiss = vi.fn();
    renderPopover({ onDismiss });
    screen.getByRole('textbox', { name: 'Search tracks' }).focus();
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
    expect(onDismiss).not.toHaveBeenCalled();
    screen.getByRole('button', { name: 'English' }).focus();
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('swallows an outside press when modal, and lets it act when not', () => {
    const onDismiss = vi.fn();
    const outside = vi.fn();
    const { unmount } = renderPopover({ onDismiss }, outside);
    const press = () => {
      const button = screen.getByRole('button', { name: 'Outside' });
      fireEvent.mouseDown(button);
      fireEvent.click(button);
    };
    press();
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(outside).not.toHaveBeenCalled();
    unmount();

    renderPopover({ onDismiss, modality: 'nonModal' }, outside);
    expect(screen.getByRole('dialog', { name: 'Audio' })).not.toHaveAttribute('aria-modal');
    press();
    expect(onDismiss).toHaveBeenCalledTimes(2);
    expect(outside).toHaveBeenCalledTimes(1);
  });

  it('closes before a Dialog around it, and gives DOM focus back to its trigger', () => {
    const onPopoverDismiss = vi.fn();
    const onDialogDismiss = vi.fn();
    const content = (open: boolean) => (
      <Dialog open title="Settings" actions={<Button>Done</Button>} onDismiss={onDialogDismiss}>
        <Popover
          open={open}
          modality="nonModal"
          title="Audio"
          onDismiss={onPopoverDismiss}
          trigger={triggerProps => (
            <button type="button" {...triggerProps}>
              Tracks
            </button>
          )}
        >
          <button type="button">English</button>
        </Popover>
      </Dialog>
    );
    const { rerender } = render(content(true));
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Audio' }), { key: 'Escape' });
    expect(onPopoverDismiss).toHaveBeenCalledTimes(1);
    expect(onDialogDismiss).not.toHaveBeenCalled();
    rerender(content(false));
    expect(screen.getByRole('button', { name: 'Tracks' })).toHaveFocus();
  });

  describe('as a non-modal sheet', () => {
    const containers = () => {
      const first = document.body.appendChild(document.createElement('div'));
      const second = document.body.appendChild(document.createElement('div'));
      return { first, second, cleanup: () => (first.remove(), second.remove()) };
    };
    const sheet = (container: HTMLElement, onDismiss: () => void, children?: ReactNode) => (
      <Popover
        open
        modality="nonModal"
        placement="sheet"
        container={container}
        title="Subtitles"
        onDismiss={onDismiss}
        trigger={triggerProps => (
          <button type="button" {...triggerProps}>
            CC
          </button>
        )}
      >
        <button type="button">Off</button>
        {children}
      </Popover>
    );
    const moveFocus = (from: HTMLElement, to: HTMLElement) => {
      from.focus();
      to.focus();
    };

    it('still closes when focus leaves it after it moved to another container', () => {
      const { first, second, cleanup } = containers();
      const onDismiss = vi.fn();
      const { rerender } = render(
        <>
          {sheet(first, onDismiss)}
          <button type="button">Outside</button>
        </>
      );
      rerender(
        <>
          {sheet(second, onDismiss)}
          <button type="button">Outside</button>
        </>
      );
      moveFocus(
        screen.getByRole('button', { name: 'Off' }),
        screen.getByRole('button', { name: 'Outside' })
      );
      expect(onDismiss).toHaveBeenCalledTimes(1);
      cleanup();
    });

    it('stays open while focus moves into a sheet nested in it, drawn elsewhere', () => {
      const { first, second, cleanup } = containers();
      const onParentDismiss = vi.fn();
      render(
        sheet(
          first,
          onParentDismiss,
          <Popover
            open
            modality="nonModal"
            placement="sheet"
            container={second}
            title="Languages"
            onDismiss={vi.fn()}
            trigger={triggerProps => (
              <button type="button" {...triggerProps}>
                More
              </button>
            )}
          >
            <button type="button">Italian</button>
          </Popover>
        )
      );
      moveFocus(
        screen.getByRole('button', { name: 'Off' }),
        screen.getByRole('button', { name: 'Italian' })
      );
      expect(onParentDismiss).not.toHaveBeenCalled();
      cleanup();
    });
  });
});

describe('KeyHint', () => {
  it('shows platform glyphs hidden from assistive technology, and the label', () => {
    const { container } = render(
      <>
        <KeyHint keys="confirm" label="Select" keyLabel="Enter" device="keyboard" />
        <KeyHint keys={['red', 'left']} label="Seek" device="remote" />
      </>
    );
    expect(screen.getByText('Select')).toBeInTheDocument();
    expect(screen.getByText('Enter', { exact: false })).toBeInTheDocument();
    const caps = container.querySelectorAll('[aria-hidden="true"]');
    expect(caps).toHaveLength(3);
    expect(caps[1]).toHaveAttribute('data-color', 'red');
    expect(container.querySelector('[tabindex]')).toBeNull();
  });
});

describe('ActionGroup and Divider', () => {
  it('keeps the actions in order, primary first, and names the group when labelled', () => {
    render(
      <ActionGroup label="Episode actions" layout="auto" align="end" divider>
        <Button>Play</Button>
        <Button>Download</Button>
      </ActionGroup>
    );
    const group = screen.getByRole('group', { name: 'Episode actions' });
    expect(group).toHaveAttribute('data-layout', 'auto');
    expect(group).toHaveAttribute('data-align', 'end');
    expect(group).toHaveAttribute('data-wrap');
    expect(group).toHaveAttribute('data-divider');
    expect(screen.getAllByRole('button').map(button => button.textContent)).toEqual([
      'Play',
      'Download',
    ]);
  });

  it('is a separator unless decorative', () => {
    render(
      <>
        <Divider spacing="md" />
        <Divider orientation="vertical" />
        <Divider decorative />
      </>
    );
    const [horizontal, vertical] = screen.getAllByRole('separator');
    expect(horizontal.tagName).toBe('HR');
    expect(horizontal).toHaveAttribute('data-spacing', 'md');
    expect(vertical).toHaveAttribute('aria-orientation', 'vertical');
    expect(screen.getAllByRole('separator')).toHaveLength(2);
  });
});

describe('SplitLayout', () => {
  it('renders the panes in reading order, named as regions when labelled', () => {
    render(
      <SplitLayout
        split="rail"
        stackBelow="medium"
        gap="lg"
        align="start"
        fill
        startLabel="Keyboard"
        start={<button type="button">A</button>}
        end={<p>Results</p>}
      />
    );
    const start = screen.getByRole('region', { name: 'Keyboard' });
    expect(start).toHaveAttribute('data-pane', 'start');
    const root = start.parentElement;
    expect(root).toHaveAttribute('data-split', 'rail');
    expect(root).toHaveAttribute('data-stack-below', 'medium');
    expect(root).toHaveAttribute('data-gap', 'lg');
    expect(root).toHaveAttribute('data-align', 'start');
    expect(root).toHaveAttribute('data-fill');
    // An unlabelled pane is not a region
    expect(screen.getAllByRole('region')).toHaveLength(1);
    expect(paneOf(screen.getByRole('button'))).toBe('start');
    expect(paneOf(screen.getByText('Results'))).toBe('end');
    expect(paneOf(root)).toBeNull();
  });

  it('stacks below its window class', () => {
    expect(isSplitStacked('compact', 'expanded')).toBe(true);
    expect(isSplitStacked('medium', 'expanded')).toBe(true);
    expect(isSplitStacked('expanded', 'expanded')).toBe(false);
    expect(isSplitStacked('large', 'large')).toBe(false);
    expect(isSplitStacked('expanded', 'large')).toBe(true);
  });

  it('crosses between the panes along the split axis only', () => {
    expect(stepSplit('start', 'right')).toBe('end');
    expect(stepSplit('end', 'left')).toBe('start');
    expect(stepSplit('end', 'right')).toBeNull();
    expect(stepSplit('start', 'down')).toBeNull();
    // Right-to-left: the start pane is on the right
    expect(stepSplit('start', 'left', { rtl: true })).toBe('end');
    expect(stepSplit('start', 'right', { rtl: true })).toBeNull();
    // Stacked: Up/Down cross, Left/Right stay
    expect(stepSplit('start', 'down', { stacked: true })).toBe('end');
    expect(stepSplit('end', 'up', { stacked: true, rtl: true })).toBe('start');
    expect(stepSplit('start', 'right', { stacked: true })).toBeNull();
  });

  it('enters a pane at its last focused item while it is still there', () => {
    let memory = rememberPaneFocus({}, 'start', 'password');
    expect(rememberPaneFocus(memory, 'start', 'password')).toBe(memory);
    memory = rememberPaneFocus(memory, 'end', 'refresh');
    expect(paneEntry(memory, 'start', ['email', 'password', 'submit'])).toBe('password');
    expect(paneEntry(memory, 'end', ['refresh'])).toBe('refresh');
    // Gone (or no longer eligible): the default entry, else the first item
    expect(paneEntry(memory, 'start', ['email', 'submit'], 'submit')).toBe('submit');
    expect(paneEntry(memory, 'start', ['email', 'submit'], 'missing')).toBe('email');
    expect(paneEntry({}, 'end', [])).toBeUndefined();
  });
});
