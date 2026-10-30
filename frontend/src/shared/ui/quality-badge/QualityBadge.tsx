import { PALETTE } from '@shared/config/constants';
import type { FC } from 'react';
import styled from 'styled-components';

import {
  qualityDescription,
  sourceLabel,
  sourceQualityState,
  type SourceReleaseType,
} from './quality';

import SparklesIcon from '~icons/ion/sparkles';
import AlertIcon from '~icons/line-md/alert';

const Badges = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  vertical-align: middle;
`;

const Badge = styled.span<{ $state: ReturnType<typeof sourceQualityState> }>`
  display: inline-flex;
  align-items: center;
  min-height: 1.65rem;
  padding: 0.15rem 0.58rem;
  border: 1px solid
    ${({ $state }) =>
      $state === 'clean'
        ? 'rgba(236, 188, 41, 0.72)'
        : $state === 'warning'
          ? 'rgba(166, 173, 175, 0.32)'
          : PALETTE.background.border};
  border-radius: 0.35rem;
  background: ${({ $state }) =>
    $state === 'clean'
      ? 'rgba(91, 67, 7, 0.34)'
      : $state === 'warning'
        ? 'rgba(46, 51, 53, 0.74)'
        : 'rgba(17, 23, 25, 0.86)'};
  color: ${({ $state }) =>
    $state === 'clean'
      ? '#ffe17a'
      : $state === 'warning'
        ? PALETTE.text.disabled
        : PALETTE.text.secondary};
  font-size: 1em;
  font-weight: 650;
  letter-spacing: 0.025em;
  white-space: nowrap;
`;

const Sparkles = styled.span`
  margin-right: 0.38rem;
  color: #ffe17a;
  font-size: 1.5em;
  line-height: 1;
  letter-spacing: -0.16em;
`;

const Warning = styled.span`
  display: inline-flex;
  align-items: center;
  color: ${PALETTE.color.warning};
`;

const WarningIcon = styled(AlertIcon)`
  width: 1.15em;
  height: 1.15em;
`;

const VisuallyHidden = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
`;

export interface QualityBadgeProps {
  /** Resolution label, e.g. "1080p" (see `qualityLabel`). */
  label: string | null;
  sourceType: SourceReleaseType | null;
  className?: string;
}

/**
 * The resolution chip (with sparkles for clean releases) and a warning icon for CAM/TS
 * releases.
 */
export const QualityBadge: FC<QualityBadgeProps> = ({ label, sourceType, className }) => {
  const release = sourceLabel(sourceType);
  const state = sourceQualityState(sourceType);
  const warning = state === 'warning';
  if (!label && !warning) return null;
  return (
    <Badges className={className}>
      {label && (
        <Badge $state={state} aria-label={qualityDescription(label, sourceType) ?? undefined}>
          {state === 'clean' && (
            <Sparkles aria-hidden="true">
              <SparklesIcon />
            </Sparkles>
          )}
          {label}
          {release && <VisuallyHidden>{release}</VisuallyHidden>}
        </Badge>
      )}
      {warning && (
        <Warning
          role="img"
          aria-label={`${release} release may have lower audio and video quality.`}
          title={`${release} release may have lower audio and video quality.`}
        >
          <WarningIcon aria-hidden="true" />
        </Warning>
      )}
    </Badges>
  );
};
