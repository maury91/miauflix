import { forwardRef, type ReactNode, useId, useState } from 'react';
import styled, { css } from 'styled-components';

import { PALETTE } from '../tokens';

import WarningIcon from '~icons/mdi/alert-outline';
import ChevronDownIcon from '~icons/mdi/chevron-down';
import ChevronUpIcon from '~icons/mdi/chevron-up';
import SearchIcon from '~icons/mdi/magnify';

const ICONS = { search: SearchIcon, warning: WarningIcon } as const;

/*
 * Sized in em so the caller's font size scales the whole panel (vw on the TV pages).
 * No grid or column flex inside buttons: Chromium 69 (2020 TVs) lays those out badly.
 */
const Panel = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2.2em 2em 1.8em;
  border-radius: 0.9em;
  background: rgba(255, 255, 255, 0.04);
  color: ${PALETTE.text.primary};
  text-align: center;
`;

const Icon = styled.span`
  display: block;
  margin-bottom: 0.6em;
  color: ${PALETTE.color.danger};
  font-size: 3em;
  line-height: 0;

  > svg {
    width: 1em;
    height: 1em;
  }
`;

const Title = styled.h3`
  margin: 0;
  font-size: 1.9em;
  font-weight: 600;
  line-height: 1.25;
  letter-spacing: 0;
  /* Page heading styles (uppercase) must not leak in. */
  text-transform: none;
  overflow-wrap: anywhere;
`;

const Description = styled.p`
  margin: 0.6em 0 0;
  max-width: 34em;
  color: ${PALETTE.text.primary};
  font-size: 1.15em;
  line-height: 1.45;
  overflow-wrap: anywhere;
`;

const Hint = styled(Description)`
  margin-top: 0.4em;
  color: ${PALETTE.text.secondary};
  font-size: 1em;
`;

const focusedRing = css`
  box-shadow: 0 0 0 0.16em #ffffff;
`;

/*
 * Chromium 69 has no :focus-visible, so :focus draws the ring there. Browsers that have it drop
 * the ring after a mouse click, unless the page drives focus here ($focused); old ones skip
 * that rule as invalid.
 */
const focusRing = css<{ $focused: boolean }>`
  &:focus {
    ${focusedRing}
  }

  &:focus:not(:focus-visible) {
    ${({ $focused }) => ($focused ? focusedRing : 'box-shadow: none;')}
  }

  &:focus-visible {
    ${focusedRing}
  }
`;

const PrimaryAction = styled.button<{ $focused: boolean }>`
  margin-top: 1.4em;
  min-width: 14em;
  padding: 0.55em 2.2em;
  border: 0;
  border-radius: 0.5em;
  background: #a50f1f;
  color: #ffffff;
  font: inherit;
  font-size: 1.3em;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  outline: none;
  ${({ $focused }) => $focused && focusedRing}
  ${focusRing}

  &:hover {
    background: #b8142a;
  }
`;

const DetailsToggle = styled.button<{ $focused: boolean }>`
  margin-top: 1em;
  padding: 0.35em 0.8em;
  border: 0;
  border-radius: 0.4em;
  background: ${({ $focused }) => ($focused ? 'rgba(255, 255, 255, 0.12)' : 'transparent')};
  color: ${PALETTE.text.primary};
  font: inherit;
  font-size: 1.05em;
  white-space: nowrap;
  cursor: pointer;
  outline: none;
  ${({ $focused }) => $focused && focusedRing}
  ${focusRing}

  > svg {
    width: 1.2em;
    height: 1.2em;
    margin-right: 0.4em;
    vertical-align: -0.25em;
  }
`;

const Details = styled.div`
  margin: 0.8em 0 0;
  max-width: 40em;
  padding: 0.8em 1.1em;
  border-radius: 0.5em;
  background: rgba(0, 0, 0, 0.35);
  color: ${PALETTE.text.secondary};
  font-size: 0.95em;
  line-height: 1.5;
  text-align: left;

  dt {
    display: inline;
    color: ${PALETTE.text.primary};
    font-weight: 600;
  }

  dt::after {
    content: ': ';
  }

  dd {
    display: inline;
    margin: 0;
    overflow-wrap: anywhere;
  }

  dd::after {
    content: '';
    display: block;
  }

  code {
    font-family: ui-monospace, Menlo, Consolas, monospace;
  }
`;

const DetailList = styled.dl`
  margin: 0;
`;

const DetailsNote = styled.p`
  margin: 0.5em 0 0;
`;

export interface StatePanelDetail {
  label: string;
  value: ReactNode;
}

export interface StatePanelAction {
  label: string;
  onClick: () => void;
  /** Focus is driven by the page on the TV; this draws it. */
  focused?: boolean;
  onFocus?: () => void;
  ref?: (element: HTMLButtonElement | null) => void;
}

export interface StatePanelProps {
  icon: keyof typeof ICONS;
  title: string;
  description?: ReactNode;
  /** Secondary line under the description, e.g. how to fix the problem. */
  hint?: ReactNode;
  action?: StatePanelAction;
  /** Collapsed "Technical details"; the toggle is a focusable action of its own. */
  details?: {
    items: StatePanelDetail[];
    note?: ReactNode;
    toggle: Omit<StatePanelAction, 'label' | 'onClick'>;
  };
  role?: 'alert' | 'status';
}

/**
 * A full-area state such as "no results" or "unavailable": icon, title, what to do, a primary
 * action, and the technical details for reporting the problem, collapsed until asked for.
 */
export const StatePanel = forwardRef<HTMLDivElement, StatePanelProps>(function StatePanel(
  { icon, title, description, hint, action, details, role = 'status' },
  ref
) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const IconComponent = ICONS[icon];
  return (
    <Panel ref={ref} role={role}>
      <Icon aria-hidden="true">
        <IconComponent />
      </Icon>
      <Title>{title}</Title>
      {description && <Description>{description}</Description>}
      {hint && <Hint>{hint}</Hint>}
      {action && (
        <PrimaryAction
          ref={action.ref}
          type="button"
          $focused={action.focused === true}
          tabIndex={action.focused === false ? -1 : 0}
          onFocus={action.onFocus}
          onClick={action.onClick}
        >
          {action.label}
        </PrimaryAction>
      )}
      {details && details.items.length > 0 && (
        <>
          <DetailsToggle
            ref={details.toggle.ref}
            type="button"
            aria-expanded={expanded}
            aria-controls={detailsId}
            $focused={details.toggle.focused === true}
            tabIndex={details.toggle.focused === false ? -1 : 0}
            onFocus={details.toggle.onFocus}
            onClick={() => setExpanded(open => !open)}
          >
            {expanded ? (
              <ChevronUpIcon aria-hidden="true" />
            ) : (
              <ChevronDownIcon aria-hidden="true" />
            )}
            Technical details
          </DetailsToggle>
          {expanded && (
            <Details id={detailsId}>
              <DetailList>
                {details.items.map(item => (
                  <DetailRow key={item.label} label={item.label} value={item.value} />
                ))}
              </DetailList>
              {details.note && <DetailsNote>{details.note}</DetailsNote>}
            </Details>
          )}
        </>
      )}
    </Panel>
  );
});

function DetailRow({ label, value }: StatePanelDetail) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}
