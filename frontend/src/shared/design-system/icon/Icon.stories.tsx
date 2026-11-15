import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';

import { Inline } from '../layout/Inline';
import { SurfaceStage } from '../storyHelpers';
import { Text } from '../text/Text';
import { Icon } from './Icon';

import CheckIcon from '~icons/mdi/check-circle';
import StarIcon from '~icons/mdi/star';

const meta = {
  title: 'Design System/Foundations/Icon',
  tags: ['autodocs'],
  component: Icon,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'A standalone icon in the control sizes’ icon sizes (`sm` 1.25rem, `md` 1.5rem, `lg` 1.75rem) or `inherit` (1em, beside text). It draws in the current text colour. Decorative by default (hidden from assistive technology); give `label` when it means something on its own. Icons inside Buttons, fields and rows are sized by those components.',
      },
    },
  },
  args: { children: <StarIcon /> },
  decorators: [
    Story => (
      <SurfaceStage surface="solid">
        <Story />
      </SurfaceStage>
    ),
  ],
} satisfies Meta<typeof Icon>;

export default meta;
type Story = StoryObj<typeof Icon>;

export const Sizes: Story = {
  render: () => (
    <Inline gap="lg" align="center">
      <Icon size="sm">
        <StarIcon />
      </Icon>
      <Icon size="md">
        <StarIcon />
      </Icon>
      <Icon size="lg">
        <StarIcon />
      </Icon>
      <Text as="span">
        <Icon>
          <StarIcon />
        </Icon>{' '}
        Inherits the text size
      </Text>
      <Icon size="md" label="Available">
        <CheckIcon />
      </Icon>
    </Inline>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Only the meaningful icon is exposed
    await expect(canvas.getAllByRole('img')).toHaveLength(1);
    await expect(canvas.getByRole('img', { name: 'Available' })).toBeInTheDocument();
  },
};
