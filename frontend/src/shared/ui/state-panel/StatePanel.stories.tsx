import type { Meta, StoryObj } from '@storybook/react-vite';

import { StatePanel } from './StatePanel';

const meta = {
  title: 'Miauflix UI/Components/StatePanel',
  component: StatePanel,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'dark' },
    docs: {
      description: {
        component:
          'A full-area state shown instead of content: no results, or a failure. Title says what happened, the description what to do, and the primary action does it. Failures keep the error id and server details under a collapsed "Technical details" toggle. Sized in em: set the font size on a wrapper (the TV pages use vw).',
      },
    },
  },
  decorators: [
    Story => (
      <div style={{ width: 560, fontSize: 16 }}>
        <Story />
      </div>
    ),
  ],
  args: { icon: 'search', title: '' },
} satisfies Meta<typeof StatePanel>;
export default meta;
type Story = StoryObj<typeof meta>;

export const NoResults: Story = {
  args: {
    icon: 'search',
    title: 'No results for ‘zzzz’',
    description: 'Try a shorter title or check the spelling.',
    action: { label: 'Clear search', onClick: () => undefined, focused: true },
  },
};

export const Unavailable: Story = {
  args: {
    role: 'alert',
    icon: 'warning',
    title: 'Search is temporarily unavailable',
    description: 'Try again in a moment.',
    action: { label: 'Try again', onClick: () => undefined, focused: true },
    details: {
      items: [
        { label: 'Error', value: 'A backend service failed unexpectedly.' },
        { label: 'Server error', value: <code>TMDB API error: (502) Bad Gateway</code> },
        { label: 'Code', value: <code>service_internal</code> },
        { label: 'Error id', value: <code>3f9a1c07</code> },
      ],
      note: 'Search the server logs (docker logs) for the error id; the browser console has the full response.',
      toggle: {},
    },
  },
};

export const NeedsSetup: Story = {
  args: {
    role: 'alert',
    icon: 'warning',
    title: 'Search needs to be set up',
    description: 'Media Catalog is not working: TMDB rejected the API access token (401).',
    hint: 'An admin needs to configure TMDB: Settings → Configuration → Media Catalog (TMDB access token).',
    action: { label: 'Try again', onClick: () => undefined, focused: true },
  },
};
