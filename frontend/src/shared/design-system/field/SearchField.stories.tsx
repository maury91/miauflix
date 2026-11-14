import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { StateCell, SurfaceStage } from '../storyHelpers';
import { useStoryVirtualFocus } from '../useStoryVirtualFocus';
import { SearchField, type SearchFieldPart } from './SearchField';

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
  const [value, setValue] = useState('');
  const [searched, setSearched] = useState<string | null>(null);
  const { containerRef, focus, focusedId } = useStoryVirtualFocus([['input', 'clear', 'submit']]);
  return (
    <div ref={containerRef} style={{ width: '22rem' }}>
      <SearchField
        label="Search"
        placeholder="Movies and shows"
        value={value}
        onChange={event => setValue(event.target.value)}
        onClear={() => {
          setValue('');
          focus('input');
        }}
        clearLabel="Clear search"
        onSearch={setSearched}
        submitLabel="Search"
        focusedPart={focusedId as SearchFieldPart}
        onPointerFocus={focus}
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
    await userEvent.click(input);
    await userEvent.keyboard('Dune');
    await expect(clear).toBeEnabled();
    await userEvent.keyboard('{Enter}');
    await expect(canvas.getByText('Searched: Dune')).toBeInTheDocument();
    await userEvent.click(clear);
    await expect(input).toHaveValue('');
    await expect(input).toHaveFocus();
    await expect(input.parentElement).toHaveAttribute('data-focused');
  },
};
