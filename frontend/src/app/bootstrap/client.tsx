// Runs first: registers the TV remote's media keys when running as a Tizen app.
import '@app/startup/tizen';
import '@shared/styles/global.css';
import '@shared/design-system/density.css';

import { AppShell } from '@app/AppShell';
import { installBrowserMeasurements } from '@app/browserMeasurements';
import { probeServer } from '@features/server-discovery/lib/probe';
import { ServerPicker } from '@features/server-discovery/ui/ServerPicker';
import { API_URL, builtForTizen, glRowsEnabled, IS_SLOW_DEVICE } from '@shared/config/constants';
import { glSurfaceSupported, preloadGlBackend } from '@shared/design-system/gl';
import { store } from '@store';
import { gsap } from 'gsap';
import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';

// Home's WebGL rows: the renderer's chunk loads while the app starts, so Home renders with it
if (glRowsEnabled && glSurfaceSupported()) void preloadGlBackend();

if (IS_SLOW_DEVICE) {
  gsap.ticker.fps(24);
}

// Measure before the first render so layout starts at the real window size.
installBrowserMeasurements(store.dispatch);

// Client-side hydration component
export function ClientApp() {
  return (
    <StrictMode>
      <Provider store={store}>
        <AppShell />
      </Provider>
    </StrictMode>
  );
}

/** The TV app's server picker, until the TV has a server that answers. */
function ServerPickerApp({ lastServer }: { lastServer?: string }) {
  return (
    <StrictMode>
      <ServerPicker lastServer={lastServer} />
    </StrictMode>
  );
}

async function start(appElement: HTMLElement) {
  // The TV app checks its server first: it may have none yet, or the server may be off
  if (builtForTizen && !(API_URL && (await probeServer(API_URL)))) {
    ReactDOM.createRoot(appElement).render(<ServerPickerApp lastServer={API_URL || undefined} />);
    return;
  }
  // Hydrate when SSR markup exists; otherwise render
  if (appElement.hasChildNodes()) {
    ReactDOM.hydrateRoot(appElement, <ClientApp />);
  } else {
    ReactDOM.createRoot(appElement).render(<ClientApp />);
  }
}

const appElement = document.getElementById('app');
if (appElement) {
  void start(appElement);
} else {
  // Helps debug unexpected container changes
  console.error('App root element #app not found.');
}
