import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button } from '../button/Button';
import { StateCell, SurfaceStage } from '../storyHelpers';
import { Message, type MessageTone } from './Message';

const meta = {
  title: 'Design System/Feedback/Message',
  tags: ['autodocs'],
  component: Message,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          "The one owner of feedback visuals: info, success, warning and danger, always with the tone's icon. The tone colors only the icon and a banner's accent edge; text stays in the text colors. Inline messages sit in forms and panels; banners are raised boxes. It is never a focus target: its actions are ordinary Buttons. Use `live` only for messages that appear after an action, so a region announces once.",
      },
    },
  },
  args: {
    tone: 'danger',
    variant: 'banner',
    title: 'Could not reach the server',
    children: 'Check that it is running and on the same network, then try again.',
  },
  argTypes: {
    tone: { control: 'inline-radio', options: ['info', 'success', 'warning', 'danger'] },
    variant: { control: 'inline-radio', options: ['inline', 'banner'] },
    actions: { control: false },
  },
  decorators: [
    Story => (
      <SurfaceStage surface="solid">
        <Story />
      </SurfaceStage>
    ),
  ],
} satisfies Meta<typeof Message>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: { actions: <Button>Try again</Button> },
};

const examples: Record<MessageTone, [string, string]> = {
  info: ['New version available', 'It installs the next time the app starts.'],
  success: ['Connection works', 'Jackett answered in 120 ms with 14 indexers.'],
  warning: ['Low disk space', 'Downloads pause below 2 GB free.'],
  danger: ['Sign-in failed', 'That email and password do not match.'],
};

export const Tones: Story = {
  render: () => (
    <>
      {(['banner', 'inline'] as const).map(variant => (
        <div key={variant} style={{ display: 'flex', flexWrap: 'wrap' }}>
          {(Object.keys(examples) as MessageTone[]).map(tone => (
            <StateCell key={tone} name={`${variant}, ${tone}`}>
              <div style={{ width: '20rem' }}>
                <Message tone={tone} variant={variant} title={examples[tone][0]}>
                  {examples[tone][1]}
                </Message>
              </div>
            </StateCell>
          ))}
        </div>
      ))}
    </>
  ),
};

export const BodyOnly: Story = {
  render: () => (
    <div style={{ maxWidth: '24rem' }}>
      <Message tone="danger">Enter the server address before testing the connection.</Message>
    </div>
  ),
};
