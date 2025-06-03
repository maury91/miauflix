import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';

import App from './app/app';
import { store } from './store/store';
import { Provider } from 'react-redux';
import { gsap } from 'gsap';
import { IS_SLOW_DEVICE } from './consts';

if (IS_SLOW_DEVICE) {
  gsap.ticker.fps(24);
}

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </StrictMode>
);
