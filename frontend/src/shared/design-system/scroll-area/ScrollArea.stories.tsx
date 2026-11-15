import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import { List } from '../list/List';
import { ListItem } from '../list/ListItem';
import { color, fontFamily, space, typeScale } from '../tokens';
import { useStoryVirtualFocus } from '../useStoryVirtualFocus';
import { ScrollArea } from './ScrollArea';

import ServerIcon from '~icons/mdi/server-outline';

const meta = {
  title: 'Design System/Layout/ScrollArea',
  tags: ['autodocs'],
  component: ScrollArea,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          "Owns a region's vertical scrolling and reveals the focused element in it. It watches `data-focused` inside: when a key moves virtual focus out of view it scrolls just enough to show the element whole, clear of sticky chrome (`stickyStart`/`stickyEnd`) with `revealMargin` around it, and locks the pointer until the motion ends. Pointer focus never scrolls; the wheel, touch and scrollbar do on the web. `scroll` mode (web) scrolls natively; `transform` mode (TV) moves the content by a compositor transition. It holds no focus state; horizontal rows are Carousels.",
      },
    },
  },
  args: { children: null },
} satisfies Meta<typeof ScrollArea>;

export default meta;
type Story = StoryObj<typeof meta>;

const rows = Array.from({ length: 30 }, (_, index) => `server-${index + 1}`);
const headerHeight = '4rem';

function SettingsPage({ mode }: { mode: 'scroll' | 'transform' }) {
  const { containerRef, focus, isFocused, focusedId } = useStoryVirtualFocus(rows.map(id => [id]));
  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', height: '24rem', background: color.canvas }}
    >
      <ScrollArea label="Servers" stickyStart={headerHeight} mode={mode}>
        {/* Room under the sticky header for the first row */}
        <div style={{ height: headerHeight }} />
        <List label="Servers">
          {rows.map((id, index) => (
            <ListItem
              key={id}
              title={`Server ${index + 1}`}
              description={`192.168.1.${index + 10}`}
              leading={<ServerIcon />}
              focused={isFocused(id)}
              onPointerFocus={() => focus(id)}
              onClick={() => undefined}
            />
          ))}
        </List>
      </ScrollArea>
      {/* Sticky chrome over the area's top edge */}
      <header
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          left: 0,
          display: 'flex',
          alignItems: 'center',
          height: headerHeight,
          padding: `0 ${space.lg}`,
          background: 'rgba(10, 13, 15, 0.92)',
          color: color.text,
          fontFamily,
          fontSize: typeScale.heading.fontSize,
          fontWeight: typeScale.heading.fontWeight,
        }}
      >
        Servers <span style={{ marginLeft: space.md, ...captionStyle }}>{focusedId}</span>
      </header>
    </div>
  );
}

const captionStyle = {
  color: color.textSecondary,
  fontSize: typeScale.caption.fontSize,
  fontWeight: 400,
};

const playReveal: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const area = canvas.getByRole('region', { name: 'Servers' });
  for (let press = 0; press < 12; press++) await userEvent.keyboard('{ArrowDown}');
  // Wait for the motion to settle
  await new Promise(resolve => setTimeout(resolve, 600));
  const row = canvas.getByRole('button', { name: /^Server 13/ });
  const header = canvasElement.querySelector('header') as HTMLElement;
  const rowBox = row.getBoundingClientRect();
  await expect(rowBox.top).toBeGreaterThanOrEqual(header.getBoundingClientRect().bottom);
  await expect(rowBox.bottom).toBeLessThanOrEqual(area.getBoundingClientRect().bottom);

  // Back up to the first rows: each is revealed under the header, not behind it
  for (let press = 0; press < 12; press++) await userEvent.keyboard('{ArrowUp}');
  await new Promise(resolve => setTimeout(resolve, 600));
  const first = canvas.getByRole('button', { name: /^Server 1(?!\d)/ }).getBoundingClientRect();
  await expect(first.top).toBeGreaterThanOrEqual(header.getBoundingClientRect().bottom);
};

/** Web: Down moves focus and the area scrolls just enough, keeping rows clear of the header. */
export const Scroll: Story = {
  render: () => <SettingsPage mode="scroll" />,
  play: playReveal,
};

/** TV: the same reveals, by a compositor transition of the content. */
export const Transform: Story = {
  render: () => <SettingsPage mode="transform" />,
  play: playReveal,
};
