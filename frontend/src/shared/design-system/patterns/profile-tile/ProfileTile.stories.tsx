import { FocusGroup } from '@shared/navigation/NavigationProvider';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { Button } from '../../button/Button';
import { Grid, GridItem } from '../../layout/Grid';
import { Stack } from '../../layout/Stack';
import { InitialFocus, NavigationStage, SurfaceStage } from '../../storyHelpers';
import { storyImage } from '../../storyImage';
import { ProfileTile } from './ProfileTile';

import FaceIcon from '~icons/mdi/emoticon-outline';

const meta = {
  title: 'Design System/Product Patterns/ProfileTile',
  tags: ['autodocs'],
  component: ProfileTile,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'A profile to choose or edit: a square CollectionTile led by the Avatar (its colour and placeholder while the picture loads or if it fails), the name below. Edit mode puts a pencil over the dimmed picture and describes the tile with `editLabel`. The profiles feature owns what choosing or editing does; the collection owns movement.',
      },
    },
  },
  args: { name: 'Profile', avatar: '' },
  decorators: [
    Story => (
      <SurfaceStage surface="solid">
        <Story />
      </SurfaceStage>
    ),
  ],
} satisfies Meta<typeof ProfileTile>;

export default meta;
type Story = StoryObj<typeof ProfileTile>;

const profiles = [
  { id: 'ana', name: 'Ana', avatar: storyImage('#f4d58d', '#e07a5f'), color: '#e07a5f' },
  { id: 'kids', name: 'Kids', avatar: storyImage('#b5e48c', '#1e6091'), color: '#1e6091' },
  { id: 'guest', name: 'Guest', avatar: 'missing.png', color: '#3d405b' },
];

function Picker() {
  const [editing, setEditing] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  return (
    <NavigationStage>
      <Stack gap="lg">
        <FocusGroup id="profiles" layout="grid" columns={3}>
          <div style={{ maxWidth: '30rem' }}>
            <Grid columns={3} gap="lg" as="ul" aria-label="Profiles">
              {profiles.map(profile => (
                <GridItem key={profile.id} as="li">
                  <ProfileTile
                    navId={profile.id}
                    name={profile.name}
                    avatar={profile.avatar}
                    color={profile.color}
                    placeholder={<FaceIcon />}
                    editing={editing}
                    editLabel="Edit profile"
                    onClick={() => setChosen(profile.name)}
                  />
                </GridItem>
              ))}
            </Grid>
          </div>
        </FocusGroup>
        <div>
          <Button navId="manage" selected={editing} onClick={() => setEditing(value => !value)}>
            {editing ? 'Done' : 'Manage profiles'}
          </Button>
        </div>
        <p data-testid="chosen" style={{ color: 'white' }}>
          {chosen ? `${editing ? 'Editing' : 'Watching as'} ${chosen}` : ''}
        </p>
      </Stack>
      <InitialFocus id="ana" />
    </NavigationStage>
  );
}

export const ChooseAndEdit: Story = {
  render: () => <Picker />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Ana' })).toHaveAttribute('data-focused');
    await userEvent.keyboard('{ArrowRight}{Enter}');
    await expect(canvas.getByTestId('chosen')).toHaveTextContent('Watching as Kids');
    await userEvent.keyboard('{ArrowDown}{Enter}');
    // Edit mode describes each tile
    await expect(canvas.getByRole('button', { name: 'Kids' })).toHaveAccessibleDescription(
      'Edit profile'
    );
    await userEvent.keyboard('{ArrowUp}{Enter}');
    await expect(canvas.getByTestId('chosen')).toHaveTextContent('Editing');
  },
};
