// Runs first: registers the TV remote's media keys when running as a Tizen app.
import '@app/startup/tizen';
import '@shared/styles/global.css';

import { AppShell } from '@app/AppShell';
import { installBrowserMeasurements } from '@app/browserMeasurements';
import { builtForTizen, IS_SLOW_DEVICE } from '@shared/config/constants';
import { legacyChromiumPlugin } from '@shared/styles/legacy-chromium';
import { store } from '@store';
import { gsap } from 'gsap';
import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { StyleSheetManager } from 'styled-components';

if (IS_SLOW_DEVICE) {
  gsap.ticker.fps(24);
}

// Measure before the first render so layout starts at the real window size.
installBrowserMeasurements(store.dispatch);

// 2020 Samsung TVs run Chromium 69: rewrite the CSS it lacks (see legacy-chromium.ts)
const stylisPlugins = builtForTizen ? [legacyChromiumPlugin] : undefined;

// Client-side hydration component
export function ClientApp() {
  return (
    <StrictMode>
      <StyleSheetManager stylisPlugins={stylisPlugins}>
        <Provider store={store}>
          <AppShell />
        </Provider>
      </StyleSheetManager>
    </StrictMode>
  );
}

// Hydrate when SSR markup exists; otherwise render
const appElement = document.getElementById('app');
if (appElement?.hasChildNodes()) {
  ReactDOM.hydrateRoot(appElement, <ClientApp />);
} else if (appElement) {
  ReactDOM.createRoot(appElement).render(<ClientApp />);
} else {
  // Helps debug unexpected container changes
  console.error('App root element #app not found.');
}
