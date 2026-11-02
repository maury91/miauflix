import { SETTINGS_PALETTE } from '@shared/config/constants';
import styled from 'styled-components';

import { IconBox, Panel } from './styles';

import FindIcon from '~icons/mdi/format-list-checks';
import InfoIcon from '~icons/mdi/information-outline';
import SearchIcon from '~icons/mdi/magnify';
import WatchIcon from '~icons/mdi/play-circle-outline';

const Steps = styled(Panel)`
  display: grid;
  grid-template-columns: minmax(150px, 0.8fr) repeat(3, minmax(0, 1.2fr));
  align-items: center;
  margin: 24px 0 36px;
  padding: 16px 12px;

  @media (max-width: 1000px) {
    grid-template-columns: 1fr 1fr;
    gap: 16px 0;
  }
  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }
`;

const Heading = styled.h2`
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0;
  padding: 0 12px;
  font-size: 18px;
  font-weight: 600;
  text-transform: none;
`;

const Step = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 16px;
  border-left: 1px solid #252b2e;

  @media (max-width: 600px) {
    border-left: 0;
  }
`;

const StepTitle = styled.h3`
  margin: 0 0 2px;
  font-size: 15px;
  font-weight: 600;
  text-transform: none;
`;

const StepText = styled.p`
  margin: 0;
  color: ${SETTINGS_PALETTE.text.secondary};
  font-size: 13px;
  line-height: 1.45;
`;

const STEPS = [
  { icon: <SearchIcon />, title: 'Search', text: 'Miauflix checks your enabled sources in order.' },
  {
    icon: <FindIcon />,
    title: 'Find',
    text: 'It looks for available files matching your movie or TV show.',
  },
  {
    icon: <WatchIcon />,
    title: 'Watch',
    text: 'Available results can be used to start playback.',
  },
];

export function HowItWorks() {
  return (
    <Steps aria-labelledby="how-it-works">
      <Heading id="how-it-works">
        <IconBox $size={40} aria-hidden="true">
          <InfoIcon />
        </IconBox>
        How it works
      </Heading>
      {STEPS.map(step => (
        <Step key={step.title}>
          <IconBox $size={40} aria-hidden="true">
            {step.icon}
          </IconBox>
          <div>
            <StepTitle>{step.title}</StepTitle>
            <StepText>{step.text}</StepText>
          </div>
        </Step>
      ))}
    </Steps>
  );
}
