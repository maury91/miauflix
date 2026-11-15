import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { NavigationStage, StateCell, SurfaceStage } from '../storyHelpers';
import { SearchField } from './SearchField';

const meta = {
  title: 'Design System/Fields/SearchField',
  tags: ['autodocs'],
  component: SearchField,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'The input shell with a search icon and optional clear and submit actions: Left/Right move input → clear → submit. The clear action shows only while there is text, but its room is always kept, so the input never jumps. When clearing hides the focused clear action, the navigation layer moves focus to the input.',
      },
    },
  },
  args: {
    label: 'Search',
    value: '',
    size: 'md',
  },
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
  },
  decorators: [
    Story => (
      <SurfaceStage surface="solid">
        <Story />
      </SurfaceStage>
    ),
  ],
} satisfies Meta<typeof SearchField>;

export default meta;
type Story = StoryObj<typeof SearchField>;

const noop = () => undefined;

export const States: Story = {
  render: () => (
    <>
      {(
        [
          ['Empty', '', undefined],
          ['With text', 'Dune', undefined],
          ['Input focused', 'Dune', 'input'],
          ['Clear focused', 'Dune', 'clear'],
          ['Submit focused', 'Dune', 'submit'],
        ] as const
      ).map(([name, value, focusedPart]) => (
        <StateCell key={name} name={name}>
          <div style={{ width: '16rem' }}>
            <SearchField
              label="Search"
              placeholder="Movies and shows"
              value={value}
              onChange={noop}
              onClear={noop}
              clearLabel="Clear search"
              onSearch={noop}
              submitLabel="Search"
              focusedPart={focusedPart}
            />
          </div>
        </StateCell>
      ))}
    </>
  ),
};

function LiveSearch() {
  return (
    <NavigationStage>
      <LiveSearchField />
    </NavigationStage>
  );
}

function LiveSearchField() {
  const [value, setValue] = useState('');
  const [searched, setSearched] = useState<string | null>(null);
  // Clear is hidden while the field is empty, so it is not a focus target then; once it is gone
  // the navigation layer moves focus back to the input
  return (
    <div style={{ width: '22rem' }}>
      <SearchField
        navId="search"
        label="Search"
        placeholder="Movies and shows"
        value={value}
        onChange={event => setValue(event.target.value)}
        onClear={() => setValue('')}
        clearLabel="Clear search"
        onSearch={setSearched}
        submitLabel="Search"
      />
      <p style={{ color: '#a6adaf' }}>Searched: {searched ?? '—'}</p>
    </div>
  );
}

export const ClearAndSubmit: Story = {
  render: () => <LiveSearch />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('searchbox', { name: 'Search' });
    // Hidden while empty, so not in the accessibility tree yet
    const clear = canvasElement.querySelector<HTMLButtonElement>('[aria-label="Clear search"]')!;
    await expect(clear).toBeDisabled();
    const submit = canvas.getByRole('button', { name: 'Search' });
    // Empty: Right skips the hidden clear action
    await userEvent.keyboard('{ArrowRight}');
    await expect(submit).toHaveAttribute('data-focused');
    await userEvent.keyboard('{ArrowLeft}');
    await userEvent.click(input);
    await userEvent.keyboard('Dune');
    await expect(clear).toBeEnabled();
    // Enter searches and ends editing (the TV keyboard closes over the results)
    await userEvent.keyboard('{Enter}');
    await expect(canvas.getByText('Searched: Dune')).toBeInTheDocument();
    await waitFor(() => expect(input).not.toHaveFocus());
    await userEvent.click(clear);
    await expect(input).toHaveValue('');
    await waitFor(() => expect(input.parentElement).toHaveAttribute('data-focused'));
    // Cleared: Right skips the clear action again
    await userEvent.keyboard('{ArrowRight}');
    await expect(submit).toHaveAttribute('data-focused');
    await expect(clear).not.toHaveAttribute('data-focused');
  },
};
