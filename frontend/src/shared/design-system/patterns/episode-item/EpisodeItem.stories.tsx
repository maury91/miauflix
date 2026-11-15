import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { Badge } from '../../badge/Badge';
import { IconButton } from '../../icon-button/IconButton';
import { List } from '../../list/List';
import { InitialFocus, NavigationStage, SurfaceStage } from '../../storyHelpers';
import { storyImage } from '../../storyImage';
import { EpisodeItem } from './EpisodeItem';

import WatchedIcon from '~icons/mdi/check-circle';
import UnwatchedIcon from '~icons/mdi/check-circle-outline';

const meta = {
  title: 'Design System/Product Patterns/EpisodeItem',
  tags: ['autodocs'],
  component: EpisodeItem,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'An episode in a season list: the still with its watched hairline, number and name, synopsis, a badge and short facts, plus trailing actions. A ListItem underneath, so rows look, move and announce alike: the row plays it (outline focus), trailing IconButtons are siblings reached with Right, the playing episode is the quiet selected fill. The details feature adapts its episodes into these props.',
      },
    },
  },
  args: { title: 'Episode' },
  decorators: [
    Story => (
      <SurfaceStage surface="solid">
        <div style={{ maxWidth: '48rem' }}>
          <Story />
        </div>
      </SurfaceStage>
    ),
  ],
} satisfies Meta<typeof EpisodeItem>;

export default meta;
type Story = StoryObj<typeof EpisodeItem>;

const episodes = [
  {
    id: 'e1',
    title: '1. Dulcinea',
    description:
      'A detective searches for a missing woman while an ice hauler answers a distress call.',
    still: storyImage('#8ecae6', '#023047'),
    metadata: '58 min',
    progress: 1,
    progressText: 'Watched',
  },
  {
    id: 'e2',
    title: '2. The big empty',
    description: 'Stranded survivors fight to stay alive as a spy reports to Earth.',
    still: storyImage('#e07a5f', '#2b2d42'),
    metadata: '44 min',
    progress: 0.35,
    progressText: '29 min left',
  },
  {
    id: 'e3',
    title: '3. Remember the Cant',
    description: 'The crew is caught between two powers.',
    still: null,
    metadata: 'Airs 12 March',
    unaired: true,
  },
];

function Season() {
  const [watched, setWatched] = useState<Record<string, boolean>>({ e1: true });
  const [playing, setPlaying] = useState('e2');
  return (
    <NavigationStage>
      <List label="Season 1">
        {episodes.map(episode => (
          <EpisodeItem
            key={episode.id}
            navId={episode.id}
            title={episode.title}
            description={episode.description}
            still={episode.still}
            metadata={episode.metadata}
            badge={episode.unaired ? <Badge>Soon</Badge> : undefined}
            progress={episode.progress}
            progressText={episode.progressText}
            selected={playing === episode.id}
            onClick={() => setPlaying(episode.id)}
            disabled={episode.unaired}
            trailing={
              episode.unaired ? undefined : (
                <IconButton
                  navId={`${episode.id}:watched`}
                  label={`Mark “${episode.title}” watched`}
                  icon={watched[episode.id] ? <WatchedIcon /> : <UnwatchedIcon />}
                  pressed={watched[episode.id] ?? false}
                  onClick={() =>
                    setWatched(current => ({ ...current, [episode.id]: !current[episode.id] }))
                  }
                />
              )
            }
          />
        ))}
      </List>
      <InitialFocus id="e1" />
    </NavigationStage>
  );
}

export const SeasonList: Story = {
  render: () => <Season />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const second = canvas.getByRole('button', { name: '2. The big empty' });
    await expect(second).toHaveAttribute('aria-current', 'true');
    // Synopsis, the progress in words, then the facts
    await expect(second).toHaveAccessibleDescription(/reports to Earth\. 29 min left 44 min$/);
    // Right reaches the row's trailing action; Confirm toggles it once
    await userEvent.keyboard('{ArrowRight}{Enter}');
    await expect(
      canvas.getByRole('button', { name: 'Mark “1. Dulcinea” watched' })
    ).toHaveAttribute('aria-pressed', 'false');
    // An unaired episode can't play
    await expect(canvas.getByRole('button', { name: '3. Remember the Cant' })).toBeDisabled();
  },
};
