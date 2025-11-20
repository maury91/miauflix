// Import SSR mocks first to set up global mocks (including JSDOM)
import './ssr-mocks';
import '@shared/styles/global.css';

import { AppShell } from '@app/AppShell';
import { store } from '@store';
import { renderToString } from 'react-dom/server';
import { Provider } from 'react-redux';
import { ServerStyleSheet } from 'styled-components';

interface RenderResult {
  appHtml: string;
  head: string;
}

// Server-side rendering function for the main index.html
export function render(_clientAssets: string[] = []): RenderResult {
  // Create a styled-components server style sheet
  const sheet = new ServerStyleSheet();

  try {
    // Render the real App component wrapped with Provider
    const appElement = (
      <Provider store={store}>
        <AppShell />
      </Provider>
    );

    // Render to HTML string
    const appHtml = renderToString(sheet.collectStyles(appElement));

    // Get the collected styles
    const styleTags = sheet.getStyleTags();

    const head = styleTags;

    return {
      appHtml,
      head,
    };
  } finally {
    // Clean up the style sheet
    sheet.seal();
  }
}
