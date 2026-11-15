import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { SearchField } from '../../field/SearchField';
import { Stack } from '../../layout/Stack';
import { InitialFocus, NavigationStage, SurfaceStage } from '../../storyHelpers';
import { SearchKeyboard } from './SearchKeyboard';
import { alphanumericKeys } from './searchKeys';

import DeleteIcon from '~icons/mdi/backspace-outline';
import ClearIcon from '~icons/mdi/close';
import SpaceIcon from '~icons/mdi/keyboard-space';

const meta = {
  title: 'Design System/Product Patterns/SearchKeyboard',
  tags: ['autodocs'],
  component: SearchKeyboard,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'The on-screen keyboard for search on TV: inverted-fill keys on a grid, with spanning keys (space, clear). It is a grid group: Left/Right stay in the row, Up/Down keep the column across spanning keys and clamp in a short row, the edges exit to the neighbouring regions. Confirm types once; a held Confirm never repeats. Space never leads or doubles, delete removes one character. `alphanumericKeys` builds the default keys; the action keys’ names come from the feature.',
      },
    },
  },
  args: { label: 'Keyboard', keys: [], value: '', onChange: () => undefined },
  decorators: [
    Story => (
      <SurfaceStage surface="solid">
        <div style={{ maxWidth: '24rem' }}>
          <Story />
        </div>
      </SurfaceStage>
    ),
  ],
} satisfies Meta<typeof SearchKeyboard>;

export default meta;
type Story = StoryObj<typeof SearchKeyboard>;

const keys = alphanumericKeys({
  space: { label: 'Space', icon: <SpaceIcon /> },
  delete: { label: 'Delete', icon: <DeleteIcon /> },
  clear: { label: 'Clear', icon: <ClearIcon /> },
});

function Search() {
  const [query, setQuery] = useState('');
  return (
    <NavigationStage>
      <Stack gap="md">
        <SearchField
          label="Search"
          clearLabel="Clear search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          onClear={() => setQuery('')}
        />
        <SearchKeyboard label="Keyboard" keys={keys} value={query} onChange={setQuery} navId="kb" />
      </Stack>
      <InitialFocus id="kb:a" />
    </NavigationStage>
  );
}

export const WithSearchField: Story = {
  render: () => <Search />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const field = canvas.getByLabelText('Search') as HTMLInputElement;
    const key = (name: string) => canvas.getByRole('button', { name });
    await expect(key('a')).toHaveAttribute('data-focused');
    // Six columns: a–f on the first row; d is the fourth
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}{Enter}');
    await expect(field.value).toBe('d');
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    await expect(field.value).toBe('dp');
    // Down the fourth column to the bottom row: Delete
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}');
    await expect(key('Delete')).toHaveAttribute('data-focused');
    await userEvent.keyboard('{Enter}');
    await expect(field.value).toBe('d');
    // Space never doubles
    await userEvent.keyboard('{ArrowLeft}{Enter}{Enter}');
    await expect(field.value).toBe('d ');
    // Up from the spanning space bar returns to the column it was entered from
    await userEvent.keyboard('{ArrowUp}{ArrowRight}{ArrowRight}');
    await expect(key('7')).toHaveAttribute('data-focused');
    await userEvent.keyboard('{ArrowDown}');
    await expect(key('Space')).toHaveAttribute('data-focused');
    await userEvent.keyboard('{ArrowUp}');
    await expect(key('7')).toHaveAttribute('data-focused');
  },
};
