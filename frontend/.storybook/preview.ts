import '@shared/styles/global.css';

import type { Preview } from '@storybook/react-vite';
import { sb } from 'storybook/test';

// Home stories replace the RTK Query hooks with deterministic story-local data.
// Keeping this mock in Storybook leaves the production API module untouched.
sb.mock(import('../src/features/media/api/lists.api.ts'), { spy: true });
sb.mock(import('../src/features/media/api/media.api.ts'));

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      value: 'dark',
      values: [
        {
          name: 'dark',
          value: '#0a0d0f',
        },
      ],
    },
    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: 'todo',
    },
  },
};

export default preview;
