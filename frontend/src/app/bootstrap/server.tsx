// Import SSR mocks first to set up global mocks (including JSDOM)
import './ssr-mocks';
import '@shared/styles/global.css';
import '@shared/design-system/density.css';

import { AppI18n } from '@app/AppI18n';
import { AppShell } from '@app/AppShell';
import { store } from '@store';
import { renderToString } from 'react-dom/server';
import { Provider } from 'react-redux';
interface RenderResult {
  appHtml: string;
  /** Extra head markup; the styles are build-time CSS the HTML already links. */
  head: string;
}

/** Server-side rendering for the main index.html. */
export function render(_clientAssets: string[] = []): RenderResult {
  const appHtml = renderToString(
    <Provider store={store}>
      <AppI18n>
        <AppShell />
      </AppI18n>
    </Provider>
  );
  return { appHtml, head: '' };
}
