import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Artwork } from './artwork/Artwork';
import { Avatar } from './avatar/Avatar';
import { Badge } from './badge/Badge';
import { Button } from './button/Button';
import { Checkbox } from './choice/Checkbox';
import { RadioGroup } from './choice/RadioGroup';
import { Switch } from './choice/Switch';
import { CollectionTile } from './collection-tile/CollectionTile';
import { Dialog } from './dialog/Dialog';
import { EmptyState } from './empty-state/EmptyState';
import { NumberField } from './field/NumberField';
import { PasswordField } from './field/PasswordField';
import { SearchField } from './field/SearchField';
import { TextField } from './field/TextField';
import { IconButton } from './icon-button/IconButton';
import { IconButtonGroup } from './icon-button-group/IconButtonGroup';
import { List } from './list/List';
import { ListItem } from './list/ListItem';
import { SettingRow } from './list/SettingRow';
import { Message } from './message/Message';
import { NavItem, NavRail } from './nav-rail/NavRail';
import { ProgressBar, ProgressSpinner } from './progress/Progress';
import { ProgressButton } from './progress-button/ProgressButton';
import { Select } from './select/Select';
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
    outside.remove();
    document.body.style.overflow = '';
  });

  it('cycles Tab inside the topmost dialog', () => {
    render(
      <Dialog
        open
        title="Remove?"
        actions={
          <>
            <Button>Keep</Button>
            <Button>Remove</Button>
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
});
