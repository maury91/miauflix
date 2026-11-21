import type { ProviderView } from '@miauflix/backend';
import { Badge, IconButton, Menu, type MenuEntry, Switch } from '@shared/design-system';
import { FocusGroup } from '@shared/navigation';
import type { DragEvent, ReactNode } from 'react';

import { describeProvider, usageLabel } from './descriptions';
import * as styles from './sources.css';

import MoreIcon from '~icons/mdi/dots-horizontal';
import DragIcon from '~icons/mdi/drag';
import PlayIcon from '~icons/mdi/play-outline';

/** The navigation IDs of a source's row: its switch, Test and the options menu's trigger. */
const providerNav = (id: string) => ({
  row: `source:${id}`,
  enabled: `source:${id}:enabled`,
  test: `source:${id}:test`,
  more: `source:${id}:more`,
  settings: `source:${id}:settings`,
});

type MenuChoice = 'settings' | 'up' | 'down' | 'remove';

interface ProviderRowProps {
  provider: ProviderView;
  index: number;
  count: number;
  busy: boolean;
  testing: boolean;
  dragging: boolean;
  dragOver: boolean;
  armed: boolean;
  onToggle: (enabled: boolean) => void;
  onTest: () => void;
  onSettings: () => void;
  onMove: (offset: -1 | 1) => void;
  onRemove?: () => void;
  onArm: (armed: boolean) => void;
  onDragStart: (event: DragEvent) => void;
  onDragEnter: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
  /** The source's settings form, open under the row. */
  detail: ReactNode;
}

/**
 * One source: the switch that turns it on, named by the source and describing it, then Test and
 * its options (settings, order, removal). The pointer can also drag the row by its handle.
 */
export function ProviderRow(props: ProviderRowProps) {
  const { provider, index, count, busy } = props;
  const nav = providerNav(provider.id);
  const items: MenuEntry[] = [
    { id: 'settings', label: 'Settings' },
    { id: 'up', label: 'Move up', disabled: busy || index === 0 },
    { id: 'down', label: 'Move down', disabled: busy || index === count - 1 },
    ...(props.onRemove ? [{ id: 'remove', label: 'Remove' }] : []),
  ];
  const choose = (id: string) => {
    const choice = id as MenuChoice;
    if (choice === 'settings') props.onSettings();
    else if (choice === 'up') props.onMove(-1);
    else if (choice === 'down') props.onMove(1);
    else props.onRemove?.();
  };

  return (
    <>
      <li
        className={styles.row}
        draggable={props.armed}
        data-dragging={props.dragging || undefined}
        data-drag-over={props.dragOver || undefined}
        onDragStart={props.onDragStart}
        onDragOver={event => {
          event.preventDefault();
          props.onDragEnter();
        }}
        onDrop={event => {
          event.preventDefault();
          props.onDrop();
        }}
        onDragEnd={props.onDragEnd}
      >
        <span
          className={styles.handle}
          aria-hidden="true"
          title="Drag to reorder"
          onMouseDown={() => props.onArm(true)}
          onMouseUp={() => props.onArm(false)}
        >
          <DragIcon />
        </span>
        <FocusGroup id={nav.row} layout="horizontal" entry="first">
          <div className={styles.rowMain}>
            <Switch
              navId={nav.enabled}
              label={provider.name}
              description={<ProviderFacts provider={provider} />}
              checked={provider.enabled}
              disabled={busy}
              onCheckedChange={props.onToggle}
            />
          </div>
          <div className={styles.rowActions}>
            <IconButton
              navId={nav.test}
              label={`Test ${provider.name}`}
              tooltip="Test"
              icon={<PlayIcon />}
              loading={props.testing}
              onClick={props.onTest}
            />
            <Menu
              label={`${provider.name} options`}
              items={items}
              align="end"
              onAction={choose}
              trigger={trigger => (
                <IconButton
                  {...trigger}
                  navId={nav.more}
                  label={`More options for ${provider.name}`}
                  icon={<MoreIcon />}
                />
              )}
            />
          </div>
        </FocusGroup>
      </li>
      {props.detail && <li className={styles.detail}>{props.detail}</li>}
    </>
  );
}

/** What the source is, its kind, how much it was used today and what went wrong lately. */
function ProviderFacts({ provider }: { provider: ProviderView }) {
  return (
    <span className={styles.facts}>
      <span>{describeProvider(provider)}</span>
      <span>{usageLabel(provider)}</span>
      {provider.health.lastError && <span>Last error: {provider.health.lastError}</span>}
      {provider.health.cooldownUntil && (
        <span>Paused until {new Date(provider.health.cooldownUntil).toLocaleString()}</span>
      )}
      <span className={styles.badges}>
        <Badge>{provider.kind}</Badge>
        {provider.requiresFlareSolverr && <Badge tone="warning">needs FlareSolverr</Badge>}
      </span>
    </span>
  );
}
