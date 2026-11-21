import '@shared/styles/global.css';
import '@shared/design-system/density.css';

import type { Preview } from '@storybook/react-vite';
import { sb } from 'storybook/test';

// Home stories replace the RTK Query hooks with deterministic story-local data.
// Keeping this mock in Storybook leaves the production API module untouched.
sb.mock(import('../src/features/media/api/lists.api.ts'), { spy: true });
// Rows read list pages from the store (homeFeedMiddleware loads them); stories supply the pages.
sb.mock(import('../src/features/home-feed/listPages.ts'), { spy: true });
sb.mock(import('../src/features/media/api/media.api.ts'));
sb.mock(import('../src/features/media/api/ratings.api.ts'));
sb.mock(import('../src/features/notifications/api/notifications.api.ts'));
sb.mock(import('../src/features/preload/api/preload.api.ts'));
sb.mock(import('../src/features/progress/api/progress.api.ts'));
// Settings and configuration stories supply their data the same way
sb.mock(import('../src/features/config/api/config.api.ts'));
sb.mock(import('../src/features/sources/api/sources.api.ts'));
sb.mock(import('../src/features/storage/api/storage.api.ts'));

const preview: Preview = {
  // Design system density is only the root font size (docs/plans/style-guide.md)
  globalTypes: {
    density: {
      description: 'Root font size: web 16px, TV 1080p 24px (TV 720p uses the web size)',
      toolbar: {
        title: 'Density',
        icon: 'mirror',
        items: [
          { value: 'web', title: 'Web (16px)' },
          { value: 'tv', title: 'TV 1080p (24px)' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { density: 'web' },
  decorators: [
    (Story, context) => {
      document.documentElement.dataset['density'] = String(context.globals['density'] ?? 'web');
      return Story();
    },
  ],
  parameters: {
    options: {
      storySort: {
        order: [
          'Miauflix UI',
          ['Introduction', 'Composition', 'Components'],
          'Design System',
          ['Foundations', 'Controls'],
          '*',
        ],
      },
    },
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
      // A story with an accessibility violation fails its test (style guide, phase 7). A story
      // that shows a deliberately broken state opts out with `parameters: { a11y: { test: 'todo' } }`.
      test: 'error',
    },
  },
};

export default preview;
