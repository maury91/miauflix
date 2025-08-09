// Import SSR mocks first to set up global mocks (including JSDOM)
import './ssr-mocks';

import React from 'react';
import { renderToString } from 'react-dom/server';
import { Provider } from 'react-redux';
import { ServerStyleSheet } from 'styled-components';

import { App } from './app/app';
import { store } from './store/store';

interface RenderResult {
  appHtml: string;
  head: string;
}

// Server-side rendering function for the main index.html
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function render(_clientAssets: string[] = []): RenderResult {
  // Create a styled-components server style sheet
  const sheet = new ServerStyleSheet();

  try {
    // Render the real App component wrapped with Provider
    const appElement = React.createElement(
      Provider,
      { store, children: [] },
      React.createElement(App)
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
