import { FocusGroup } from '@shared/navigation/NavigationProvider';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { NavigationStage, StateCell, SurfaceStage } from '../storyHelpers';
import { space } from '../tokens';
import { Chip, FilterChip, RemovableChip } from './Chip';

import TranslateIcon from '~icons/mdi/translate';

const meta = {
  title: 'Design System/Collections/Chip',
  tags: ['autodocs'],
  component: Chip,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          "Pills in the `sm` (web) or `md` (TV) control size. A passive Chip is a label on an opaque quiet fill with no border, so it never reads as a resting action; it is never a focus target. A FilterChip is an inverted-fill action that toggles (`aria-pressed`): selected adds the translucent fill and a check, which carries selection over media where rest is already translucent. A RemovableChip holds two sibling actions in one pill, the body (when it acts) and the remove circle, each with its own white focus fill; Right moves body → remove, and after removal the collection focuses the nearest chip. Labels, including the remove action's name, come from the feature.",
      },
    },
  },
  args: { children: 'Drama' },
} satisfies Meta<typeof Chip>;

export default meta;
type Story = StoryObj<typeof Chip>;

const noop = () => undefined;
// Centred like the chips themselves: an inline-flex box's baseline is its first item's (an icon or text)
const spaced = { display: 'inline-flex', verticalAlign: 'middle', marginRight: space.xs } as const;

function Matrix() {
  return (
    <>
      <StateCell name="Passive">
        <span style={spaced}>
          <Chip>Drama</Chip>
        </span>
        <Chip size="md">Science fiction</Chip>
      </StateCell>
      <StateCell name="Filter: rest, selected, focused, selected + focused, disabled">
        <span style={spaced}>
          <FilterChip selected={false} onSelectedChange={noop} icon={<TranslateIcon />}>
            Dubbed
          </FilterChip>
        </span>
        <span style={spaced}>
          <FilterChip selected onSelectedChange={noop}>
            4K
          </FilterChip>
        </span>
        <span style={spaced}>
          <FilterChip selected={false} focused onSelectedChange={noop}>
            HDR
          </FilterChip>
        </span>
        <span style={spaced}>
          <FilterChip selected focused onSelectedChange={noop}>
            Subtitled
          </FilterChip>
        </span>
        <FilterChip selected={false} disabled onSelectedChange={noop}>
          Dolby Vision
        </FilterChip>
      </StateCell>
      <StateCell name="Removable: rest, body focused, remove focused, md">
        <span style={spaced}>
          <RemovableChip removeLabel="Remove dune" onRemove={noop} onClick={noop}>
            dune
          </RemovableChip>
        </span>
        <span style={spaced}>
          <RemovableChip
            removeLabel="Remove arrival"
            onRemove={noop}
            onClick={noop}
            focusedPart="body"
          >
            arrival
          </RemovableChip>
        </span>
        <span style={spaced}>
          <RemovableChip removeLabel="Remove severance" onRemove={noop} focusedPart="remove">
            severance
          </RemovableChip>
        </span>
        <RemovableChip size="md" removeLabel="Remove the expanse" onRemove={noop} onClick={noop}>
          the expanse
        </RemovableChip>
      </StateCell>
    </>
  );
}

export const OnCanvas: Story = {
  render: () => (
    <SurfaceStage surface="solid">
      <Matrix />
    </SurfaceStage>
  ),
};

export const OverArtwork: Story = {
  render: () => (
    <SurfaceStage surface="overMedia">
      <Matrix />
    </SurfaceStage>
  ),
};

const filterIds = ['4k', 'hdr', 'dubbed'] as const;
const filterLabels = { '4k': '4K', hdr: 'HDR', dubbed: 'Dubbed' };

function SearchChips() {
  const [filters, setFilters] = useState<string[]>([]);
  const [recents, setRecents] = useState(['dune', 'arrival', 'severance']);
  const [searched, setSearched] = useState('');

  return (
    <NavigationStage>
      <FocusGroup id="filters" layout="horizontal">
        <div style={{ marginBottom: space.md }}>
          {filterIds.map(id => (
            <span key={id} style={spaced}>
              <FilterChip
                selected={filters.includes(id)}
                onSelectedChange={on =>
                  setFilters(list => (on ? [...list, id] : list.filter(item => item !== id)))
                }
                navId={`filter:${id}`}
              >
                {filterLabels[id]}
              </FilterChip>
            </span>
          ))}
        </div>
      </FocusGroup>
      <FocusGroup id="recents" layout="horizontal">
        <div>
          {recents.map(query => (
            <span key={query} style={spaced}>
              <RemovableChip
                removeLabel={`Remove ${query}`}
                onClick={() => setSearched(query)}
                // The navigation layer focuses the nearest chip once it is gone
                onRemove={() => setRecents(list => list.filter(item => item !== query))}
                navId={`recent:${query}`}
              >
                {query}
              </RemovableChip>
            </span>
          ))}
        </div>
      </FocusGroup>
      <p style={{ color: '#a6adaf' }}>Searched: {searched}</p>
    </NavigationStage>
  );
}

/**
 * Filters on the first row toggle with Confirm; recent searches below run again from their body
 * or go away from their remove circle, and focus lands on the nearest chip.
 */
export const SearchFilters: Story = {
  render: () => <SearchChips />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const fourK = canvas.getByRole('button', { name: '4K' });
    await expect(fourK).toHaveAttribute('data-focused');
    await userEvent.keyboard('{Enter}');
    await expect(fourK).toHaveAttribute('aria-pressed', 'true');

    await userEvent.keyboard('{ArrowDown}');
    await expect(canvas.getByRole('button', { name: 'dune' })).toHaveAttribute('data-focused');
    await userEvent.keyboard('{ArrowRight}');
    const remove = canvas.getByRole('button', { name: 'Remove dune' });
    await expect(remove).toHaveAttribute('data-focused');
    await userEvent.keyboard('{Enter}');
    await expect(canvas.queryByRole('button', { name: 'dune' })).toBeNull();
    const arrival = canvas.getByRole('button', { name: 'arrival' });
    await expect(arrival).toHaveAttribute('data-focused');
    await userEvent.keyboard('{Enter}');
    await expect(canvas.getByText('Searched: arrival')).toBeInTheDocument();
  },
};
