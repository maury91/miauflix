import { forwardRef, type MouseEventHandler, useState } from 'react';

import { Rail, RailIcon, RailItem, RailNavigation } from './rail.styles';

import BackIcon from '~icons/mdi/arrow-left';

export interface BackRailProps {
  /** Accessible name of the back button, e.g. "Back to Home". */
  label: string;
  onBack: MouseEventHandler<HTMLButtonElement>;
  onFocus?: () => void;
}

/**
 * The navigation rail's chrome on inner pages (search, details, settings): it never expands and
 * holds only a back button where the sidebar's items start.
 */
export const BackRail = forwardRef<HTMLButtonElement, BackRailProps>(
  ({ label, onBack, onFocus }, ref) => {
    // Like the sidebar, the focused item is drawn selected.
    const [focused, setFocused] = useState(false);
    return (
      <Rail $active={false} aria-label="Page navigation">
        <RailNavigation>
          <RailItem
            ref={ref}
            type="button"
            $active={false}
            $selected={focused}
            aria-label={label}
            onClick={onBack}
            onFocus={() => {
              setFocused(true);
              onFocus?.();
            }}
            onBlur={() => setFocused(false)}
            onMouseEnter={onFocus}
          >
            <RailIcon aria-hidden="true">
              <BackIcon />
            </RailIcon>
          </RailItem>
        </RailNavigation>
      </Rail>
    );
  }
);
BackRail.displayName = 'BackRail';
