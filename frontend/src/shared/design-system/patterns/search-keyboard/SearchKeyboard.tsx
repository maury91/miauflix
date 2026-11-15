import { useFocusable } from '@shared/navigation/hooks';
import { FocusGroup } from '@shared/navigation/NavigationProvider';
import { useLayoutEffect, useRef } from 'react';

import { visuallyHidden } from '../../a11y.css';
import { Button } from '../../button/Button';
import { Grid, GridItem } from '../../layout/Grid';
import { applyKey, type KeyboardKey } from './searchKeys';

export interface SearchKeyboardProps {
  /** The keyboard's name for assistive technology ("Keyboard"). */
  label: string;
  /** The keys in reading order; `alphanumericKeys` builds the default set. */
  keys: readonly KeyboardKey[];
  /** Columns of the key grid; spans never exceed it. */
  columns?: number;
  /** The text being entered, owned by the feature (usually shown in a SearchField). */
  value: string;
  /** Called with the new text after each key. */
  onChange: (value: string) => void;
  /**
   * Registers the keys as a grid group with the navigation layer (each `<navId>:<key id>`): Up/Down
   * keep the column across spanning keys, the edges exit to the neighbouring regions.
   */
  navId?: string;
  /** Without the navigation layer: the key holding virtual focus. */
  focusedId?: string;
  /** Without the navigation layer: called when the pointer moves onto a key. */
  onPointerFocus?: (id: string) => void;
}

/**
 * The on-screen keyboard for search on TV: a grid of inverted-fill keys with spans (space, clear),
 * moved through as a grid group. Confirm types once; a held Confirm never repeats. It owns key
 * sizes, spans and movement; what the text searches for stays with the feature.
 */
export function SearchKeyboard({
  label,
  keys,
  columns = 6,
  value,
  onChange,
  navId,
  focusedId,
  onPointerFocus,
}: SearchKeyboardProps) {
  // A press reads the text at the time of the press, not of the render that drew the key
  const latest = useRef({ value, onChange });
  useLayoutEffect(() => {
    latest.current = { value, onChange };
  });
  const press = (key: KeyboardKey) => {
    const next = applyKey(latest.current.value, key);
    if (next !== latest.current.value) latest.current.onChange(next);
  };
  return (
    <FocusGroup id={navId} layout="grid" columns={columns} disabled={navId === undefined}>
      <Grid columns={columns} gap="2xs" role="group" aria-label={label}>
        {keys.map(key => (
          <GridItem key={key.id} span={Math.min(key.span ?? 1, columns)}>
            <Key
              keyboardKey={key}
              span={Math.min(key.span ?? 1, columns)}
              navId={navId === undefined ? undefined : `${navId}:${key.id}`}
              focused={focusedId === key.id}
              onPointerFocus={() => onPointerFocus?.(key.id)}
              onPress={() => press(key)}
            />
          </GridItem>
        ))}
      </Grid>
    </FocusGroup>
  );
}

function Key({
  keyboardKey: key,
  span,
  navId,
  focused,
  onPointerFocus,
  onPress,
}: {
  keyboardKey: KeyboardKey;
  span: number;
  navId: string | undefined;
  focused: boolean;
  onPointerFocus: () => void;
  onPress: () => void;
}) {
  // Registered here rather than by the Button, so the grid group knows the key's span
  const nav = useFocusable<HTMLButtonElement>(navId, { span });
  const icon = key.kind === 'character' ? undefined : key.icon;
  return (
    <Button
      ref={nav.ref}
      fullWidth
      icon={icon}
      focused={focused || nav.focused}
      onMouseMove={() => {
        nav.onMouseMove();
        onPointerFocus();
      }}
      onClick={onPress}
    >
      {key.kind === 'character' ? (
        key.value
      ) : icon ? (
        <span className={visuallyHidden}>{key.label}</span>
      ) : (
        key.label
      )}
    </Button>
  );
}
