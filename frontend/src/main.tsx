import { gsap } from 'gsap';
import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';

import App from './app/app';
import { IS_SLOW_DEVICE } from './consts';
import { store } from './store/store';

if (IS_SLOW_DEVICE) {
  gsap.ticker.fps(24);
}

// Client-side hydration component
export function ClientApp() {
  return (
    <StrictMode>
      <Provider store={store}>
        <App />
      </Provider>
    </StrictMode>
  );
}

// Hydrate instead of render to match SSR content
const appElement = document.getElementById('app') as HTMLElement;
const root = ReactDOM.createRoot(appElement);

// Use hydrate for SSR compatibility
root.render(<ClientApp />);
