import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';

import { Button } from '../button/Button';
import { Stack } from '../layout/Stack';
import { List } from '../list/List';
import { ListItem } from '../list/ListItem';
import { SurfaceStage } from '../storyHelpers';
import { Section } from './Section';

import AddIcon from '~icons/mdi/plus';
import ServerIcon from '~icons/mdi/server-outline';

const meta = {
  title: 'Design System/Layout/Section',
  tags: ['autodocs'],
  component: Section,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          "A titled part of a page: heading (level 2 or 3, which names the `section` region), optional description and actions, then the content. Actions sit at the header's end and wrap under the text, aligned with the heading, when there is no room. Padding is a space token. It holds no service or media state.",
      },
    },
  },
  args: { title: 'Servers' },
  decorators: [
    Story => (
      <SurfaceStage surface="solid">
        <Story />
      </SurfaceStage>
    ),
  ],
} satisfies Meta<typeof Section>;

export default meta;
type Story = StoryObj<typeof meta>;

const servers = (
  <List label="Servers">
    <ListItem
      title="Home server"
      description="192.168.1.20"
      leading={<ServerIcon />}
      onClick={() => undefined}
    />
    <ListItem
      title="Office server"
      description="10.0.0.4"
      leading={<ServerIcon />}
      onClick={() => undefined}
    />
  </List>
);

export const WithActions: Story = {
  render: () => (
    <div style={{ maxWidth: '40rem' }}>
      <Section
        title="Servers"
        description="Where your library is stored. The first reachable one is used."
        actions={<Button icon={<AddIcon />}>Add server</Button>}
      >
        {servers}
      </Section>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const region = within(canvasElement).getByRole('region', { name: 'Servers' });
    await expect(region).toHaveAccessibleDescription(
      'Where your library is stored. The first reachable one is used.'
    );
  },
};

/** Narrow: the actions wrap under the text, lined up with the heading. */
export const Narrow: Story = {
  render: () => (
    <div style={{ width: '18rem' }}>
      <Section
        title="Servers"
        description="Where your library is stored."
        actions={
          <>
            <Button icon={<AddIcon />}>Add</Button>
            <Button>Test all</Button>
          </>
        }
      >
        {servers}
      </Section>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const heading = canvas.getByRole('heading', { name: 'Servers' }).getBoundingClientRect();
    const add = canvas.getByRole('button', { name: 'Add' }).getBoundingClientRect();
    await expect(add.top).toBeGreaterThan(heading.bottom);
    await expect(Math.abs(add.left - heading.left)).toBeLessThan(1);
  },
};

/** Sections nest with a lower heading level. */
export const Nested: Story = {
  render: () => (
    <div style={{ maxWidth: '40rem' }}>
      <Section title="Playback" description="How titles play on this device.">
        <Stack gap="xl">
          <Section title="Servers" headingLevel={3}>
            {servers}
          </Section>
          <Section title="Subtitles" headingLevel={3} description="Size and timing.">
            <span />
          </Section>
        </Stack>
      </Section>
    </div>
  ),
};
