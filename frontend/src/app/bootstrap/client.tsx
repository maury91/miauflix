import '@shared/styles/global.css';

import { AppShell } from '@app/AppShell';
import { IS_SLOW_DEVICE } from '@shared/config/constants';
import { store } from '@store';
import { gsap } from 'gsap';
import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';

if (IS_SLOW_DEVICE) {
  gsap.ticker.fps(24);
}

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
