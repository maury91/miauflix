/* eslint-disable react-refresh/only-export-components */
import { store } from '@store';
import { render as rtlRender, type RenderOptions, type RenderResult } from '@testing-library/react';
import type { PropsWithChildren, ReactElement } from 'react';
import { Provider } from 'react-redux';
import { ThemeProvider } from 'styled-components';

// Basic theme for styled-components (minimal theme for testing)
const testTheme = {
  // Add minimal theme properties if needed
  // This can be expanded based on your styled-components theme requirements
};

type AppStore = typeof store;

interface ExtendedRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  store?: AppStore;
  withTheme?: boolean;
}

function AllTheProviders({
  children,
  testStore = store,
  withTheme = true,
}: PropsWithChildren<{ testStore?: AppStore; withTheme?: boolean }>) {
  const content = withTheme ? (
    <ThemeProvider theme={testTheme}>{children}</ThemeProvider>
  ) : (
    children
  );

  return <Provider store={testStore || store}>{content}</Provider>;
}

/**
 * Custom render function that includes Redux Provider and optionally ThemeProvider
 *
 * Uses the core store (React-agnostic) but wraps with React-Redux Provider for testing
 * @param ui - Component to render
 * @param options - Extended render options
 * @returns RenderResult with additional utilities
 */
export function render(
  ui: ReactElement,
  { store: testStore, withTheme = true, ...renderOptions }: ExtendedRenderOptions = {}
): RenderResult {
  // Use the provided store or the default store
  const actualStore = testStore || store;

  function Wrapper({ children }: PropsWithChildren) {
    return (
      <AllTheProviders testStore={actualStore} withTheme={withTheme}>
        {children}
      </AllTheProviders>
    );
  }

  // Return the render result
  return rtlRender(ui, { wrapper: Wrapper, ...renderOptions });
}

/**
 * Render a component without any providers (for testing pure components)
 */
export const renderWithoutProviders = rtlRender;

/**
 * Render a component with only the theme provider
 */
export function renderWithTheme(ui: ReactElement, options: RenderOptions = {}) {
  function Wrapper({ children }: PropsWithChildren) {
    return <ThemeProvider theme={testTheme}>{children}</ThemeProvider>;
  }

  return rtlRender(ui, { wrapper: Wrapper, ...options });
}

// Re-export everything from React Testing Library
export * from '@testing-library/react';
export { userEvent } from '@testing-library/user-event';
