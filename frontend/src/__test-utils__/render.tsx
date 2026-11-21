/* eslint-disable react-refresh/only-export-components */
import { store } from '@store';
import { render as rtlRender, type RenderOptions, type RenderResult } from '@testing-library/react';
import type { PropsWithChildren, ReactElement } from 'react';
import { Provider } from 'react-redux';

type AppStore = typeof store;

interface ExtendedRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  store?: AppStore;
}

/**
 * Render inside the necessary providers
 */
export function render(
  ui: ReactElement,
  { store: testStore, ...renderOptions }: ExtendedRenderOptions = {}
): RenderResult {
  const actualStore = testStore ?? store;
  function Wrapper({ children }: PropsWithChildren) {
    return <Provider store={actualStore}>{children}</Provider>;
  }
  return rtlRender(ui, { wrapper: Wrapper, ...renderOptions });
}

/** Render a component without any providers (for testing pure components). */
export const renderWithoutProviders = rtlRender;

// Re-export everything from React Testing Library
export * from '@testing-library/react';
export { userEvent } from '@testing-library/user-event';
