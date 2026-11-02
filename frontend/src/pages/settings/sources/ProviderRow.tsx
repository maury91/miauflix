import type { ProviderView } from '@miauflix/backend';
import { SETTINGS_PALETTE } from '@shared/config/constants';
import { Button, Switch } from '@shared/ui';
import { type DragEvent, type ReactNode, useEffect, useRef } from 'react';
import styled from 'styled-components';

import { describeProvider, usageLabel } from './descriptions';
import { Badge, BORDER, Muted } from './styles';

import MoreIcon from '~icons/mdi/dots-horizontal';
import DragIcon from '~icons/mdi/drag';
import PlayIcon from '~icons/mdi/play-outline';

const Row = styled.li<{ $over: boolean; $dragging: boolean }>`
  display: grid;
  grid-template-columns:
    28px minmax(300px, 1.3fr) minmax(0, 1.1fr) minmax(170px, 0.9fr)
    auto auto auto;
  align-items: center;
  gap: 12px 16px;
  min-height: 52px;
  padding: 8px 14px 8px 8px;
  border-top: 1px solid ${BORDER};
  opacity: ${({ $dragging }) => ($dragging ? 0.45 : 1)};
  box-shadow: ${({ $over }) =>
    $over ? `inset 0 2px 0 ${SETTINGS_PALETTE.color.interactive}` : 'none'};
  list-style: none;

  &:first-child {
    border-top: 0;
  }

  @media (max-width: 1100px) {
    grid-template-columns: 28px minmax(0, 1fr) auto auto auto;
    > [data-cell='description'],
    > [data-cell='usage'] {
      grid-column: 2 / -1;
    }
  }
`;

const Handle = styled.span`
  display: grid;
  place-items: center;
  color: #6c7479;
  font-size: 22px;
  cursor: grab;
  touch-action: none;
`;

const Identity = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex-wrap: wrap;
`;

const Dot = styled.span<{ $on: boolean }>`
  width: 10px;
  height: 10px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: ${({ $on }) => ($on ? SETTINGS_PALETTE.color.success : '#6b7280')};
`;

const Name = styled.strong`
  font-size: 15px;
  font-weight: 600;
  text-transform: uppercase;
  overflow-wrap: anywhere;
`;

const Usage = styled(Muted)`
  padding-left: 16px;
  border-left: 1px solid ${BORDER};
`;

const MenuWrap = styled.div`
  position: relative;
`;

const Menu = styled.div`
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 5;
  display: grid;
  min-width: 190px;
  padding: 6px;
  border: 1px solid #343b3f;
  border-radius: 10px;
  background: #171c1f;
`;

export const MenuItem = styled.button`
  padding: 10px 12px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: ${SETTINGS_PALETTE.text.primary};
  font:
    14px 'Poppins',
    sans-serif;
  text-align: left;
  cursor: pointer;

  &:hover:not(:disabled),
  &:focus-visible {
    outline: none;
    background: #232a2e;
  }
  &:disabled {
    color: #5d656a;
    cursor: not-allowed;
  }
`;

const Detail = styled.li`
  padding: 16px 16px 20px 52px;
  border-top: 1px solid ${BORDER};
  list-style: none;
  background: #0e1214;
`;

interface ProviderRowProps {
  provider: ProviderView;
  index: number;
  count: number;
  busy: boolean;
  menuOpen: boolean;
  dragging: boolean;
  dragOver: boolean;
  armed: boolean;
  onToggle: (enabled: boolean) => void;
  onTest: () => void;
  onMenu: (open: boolean) => void;
  onSettings: () => void;
  onMove: (offset: -1 | 1) => void;
  onRemove?: () => void;
  onArm: (armed: boolean) => void;
  onDragStart: (event: DragEvent) => void;
  onDragEnter: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
  detail: ReactNode;
}

export function ProviderRow(props: ProviderRowProps) {
  const { provider, index, count, busy, menuOpen } = props;
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.parentElement?.contains(event.target as Node)) props.onMenu(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuOpen]);

  const choose = (action: () => void) => () => {
    props.onMenu(false);
    triggerRef.current?.focus();
    action();
  };

  return (
    <>
      <Row
        draggable={props.armed}
        $over={props.dragOver}
        $dragging={props.dragging}
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
        <Handle
          aria-hidden="true"
          title="Drag to reorder"
          onMouseDown={() => props.onArm(true)}
          onMouseUp={() => props.onArm(false)}
        >
          <DragIcon />
        </Handle>
        <Identity>
          <Dot
            $on={provider.enabled}
            role="img"
            aria-label={provider.enabled ? 'Enabled' : 'Disabled'}
          />
          <Name>{provider.name}</Name>
          <Badge>{provider.kind}</Badge>
          {provider.requiresFlareSolverr && <Badge>needs FlareSolverr</Badge>}
        </Identity>
        <div data-cell="description">
          <Muted>{describeProvider(provider)}</Muted>
          {provider.health.lastError && <Muted>Last error: {provider.health.lastError}</Muted>}
          {provider.health.cooldownUntil && (
            <Muted>Paused until {new Date(provider.health.cooldownUntil).toLocaleString()}</Muted>
          )}
        </div>
        <Usage data-cell="usage">{usageLabel(provider)}</Usage>
        <Switch
          aria-label={`${provider.enabled ? 'Disable' : 'Enable'} ${provider.name}`}
          checked={provider.enabled}
          disabled={busy}
          onCheckedChange={props.onToggle}
        />
        <Button
          size="small"
          appearance="settings"
          color="secondary"
          aria-label={`Test ${provider.name}`}
          onClick={props.onTest}
        >
          <PlayIcon aria-hidden="true" /> Test
        </Button>
        <MenuWrap>
          <Button
            ref={triggerRef}
            size="small"
            appearance="settings"
            color="secondary"
            aria-label={`More options for ${provider.name}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => props.onMenu(!menuOpen)}
          >
            <MoreIcon aria-hidden="true" />
          </Button>
          {menuOpen && (
            <Menu
              ref={menuRef}
              role="menu"
              aria-label={`${provider.name} options`}
              onKeyDown={event => {
                if (event.key === 'Escape') {
                  event.stopPropagation();
                  props.onMenu(false);
                  triggerRef.current?.focus();
                }
              }}
            >
              <MenuItem role="menuitem" onClick={choose(props.onSettings)}>
                Settings
              </MenuItem>
              <MenuItem
                role="menuitem"
                disabled={busy || index === 0}
                onClick={choose(() => props.onMove(-1))}
              >
                Move up
              </MenuItem>
              <MenuItem
                role="menuitem"
                disabled={busy || index === count - 1}
                onClick={choose(() => props.onMove(1))}
              >
                Move down
              </MenuItem>
              {props.onRemove && (
                <MenuItem role="menuitem" onClick={choose(props.onRemove)}>
                  Remove
                </MenuItem>
              )}
            </Menu>
          )}
        </MenuWrap>
      </Row>
      {props.detail && <Detail>{props.detail}</Detail>}
    </>
  );
}
