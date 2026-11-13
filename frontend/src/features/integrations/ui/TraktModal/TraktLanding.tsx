import { ActionRow } from '@shared/ui/action-row/ActionRow';
import styled from 'styled-components';

import { Action, Copy } from './TraktModal.styles';

import StarIcon from '~icons/line-md/star';
import BookmarkIcon from '~icons/mdi/bookmark-outline';
import ExternalIcon from '~icons/mdi/open-in-new';
import ProgressIcon from '~icons/mdi/progress-clock';

const Benefits = styled.ul`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1.5rem;
  padding: 0;
  margin: 2.375rem 0 0;
  list-style: none;

  @media (max-width: 600px) {
    grid-template-columns: 1fr;
    gap: 1rem;
  }
`;

const Benefit = styled.li`
  display: flex;
  align-items: center;
  gap: 1.125rem;
  color: #e1e4e9;
  font-size: 1.125rem;
  line-height: 1.4;
`;

const IconTile = styled.span`
  flex: 0 0 3.5rem;
  height: 3.5rem;
  display: grid;
  place-items: center;
  //border: 2px solid rgba(255, 255, 255, 0.08);
  border-radius: 0.75rem;
  //background: linear-gradient(135deg, rgba(255, 255, 255, 0.045), rgba(255, 255, 255, 0.015));
  color: #fa438a;

  svg {
    width: 1.75rem;
    height: 1.75rem;
  }
`;

const Actions = styled(ActionRow)`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: stretch;
  gap: 1.5rem;
  margin-top: 2.5rem;
  padding-top: 1.875rem;
  border-top: 0;

  @media (max-width: 600px) {
    grid-template-columns: 1fr;
    grid-auto-rows: 1fr;
    gap: 0.75rem;
    margin-top: 1.5rem;
    padding-top: 1.5rem;
  }
`;

const BenefitsSubtitle = styled.p`
  color: #bac1ca;
  font-size: clamp(1rem, 1.65vw, 1.5rem);
  line-height: 1.4;
  margin: 3rem 0 0;
  font-weight: 600;
`;

interface LandingProps {
  busy: boolean;
  error: string | null;
  onBegin: () => void;
  onDismiss: () => void;
}

/** Offer Trakt connection or permanent dismissal, disabling the connection action while busy. */
export function TraktLanding({ busy, error, onBegin, onDismiss }: LandingProps) {
  return (
    <>
      <BenefitsSubtitle>With Trakt you can:</BenefitsSubtitle>
      <Benefits aria-label="Trakt benefits">
        <Benefit>
          <IconTile>
            <BookmarkIcon />
          </IconTile>
          <span>
            Sync
            <br />
            watchlist
          </span>
        </Benefit>
        <Benefit>
          <IconTile>
            <ProgressIcon />
          </IconTile>
          <span>
            Track
            <br />
            progress
          </span>
        </Benefit>
        <Benefit>
          <IconTile>
            <StarIcon />
          </IconTile>
          <span>
            Get movies
            <br />
            recommendations
          </span>
        </Benefit>
      </Benefits>
      {error && <Copy role="alert">{error}</Copy>}
      <Actions>
        <Action
          color="primary"
          fullWidth
          type="button"
          disabled={busy}
          onClick={onBegin}
          data-modal-action="0"
        >
          <ExternalIcon aria-hidden="true" />
          {busy ? 'Connecting…' : "Let's go"}
        </Action>
        <Action color="secondary" fullWidth type="button" data-modal-action="1" onClick={onDismiss}>
          Don’t ask again
        </Action>
      </Actions>
    </>
  );
}
