// Runs first: moves the settings saved under the old name before anything reads them.
import '@app/startup/storage-rename';
// Then registers the TV remote's media keys when running as a Tizen app.
import '@app/startup/tizen';
import '@shared/styles/global.css';
import '@shared/design-system/density.css';

import { AppI18n } from '@app/AppI18n';
import { AppShell } from '@app/AppShell';
import { installBrowserMeasurements } from '@app/browserMeasurements';
import { probeServer } from '@features/server-discovery/lib/probe';
import { ServerPicker } from '@features/server-discovery/ui/ServerPicker';
import { API_URL, builtForTizen, glRowsEnabled, IS_SLOW_DEVICE } from '@shared/config/constants';
import { glSurfaceSupported, preloadGlBackend } from '@shared/design-system/gl';
import { I18nProvider, resolveInterfaceLanguage } from '@shared/i18n';
import { setActiveLanguage } from '@shared/i18n/translate';
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
        <AppI18n>
          <AppShell />
        </AppI18n>
      </Provider>
    </StrictMode>
  );
}

/**
 * The TV app's server picker, until the TV has a server that answers. No profile is signed in
 * without a server: the picker speaks the device's language.
 */
function ServerPickerApp({ lastServer }: { lastServer?: string }) {
  return (
    <StrictMode>
      <I18nProvider>
        <ServerPicker lastServer={lastServer} />
      </I18nProvider>
    </StrictMode>
  );
}

async function start(appElement: HTMLElement) {
  // The TV app checks its server first: it may have none yet, or the server may be off
  if (builtForTizen && !(API_URL && (await probeServer(API_URL)))) {
    // Copy built outside the tree (the picker's messages) is in the device's language from the start
    setActiveLanguage(resolveInterfaceLanguage(null, navigator.languages ?? []));
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
