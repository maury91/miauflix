import { Button, Disclosure, EmptyState, SurfaceContextProvider } from '@shared/design-system';
import { t } from '@shared/i18n';
import { FocusScope, NavigationProvider } from '@shared/navigation';
import type { ComponentType, ReactNode } from 'react';
import { Component } from 'react';

import * as styles from './errorBoundary.css';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ComponentType<{ error?: Error; resetError: () => void }>;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

const DefaultErrorFallback: ComponentType<{ error?: Error; resetError: () => void }> = ({
  error,
  resetError,
}) => (
  // Its own navigation layer: it replaces whatever owned the keys before the error
  <NavigationProvider>
    <SurfaceContextProvider value="solid">
      <FocusScope autoFocus>
        <div className={styles.fallback} role="alert">
          <EmptyState
            heading={t('common.somethingWrong')}
            actions={
              <Button navId="error-boundary-retry" onClick={resetError}>
                {t('common.tryAgain')}
              </Button>
            }
          >
            {t('common.unexpected')}
          </EmptyState>
          {error && (
            <div className={styles.details}>
              <Disclosure navId="error-boundary-details" title={t('common.technicalDetails')}>
                <pre className={styles.stack}>{error.stack}</pre>
              </Disclosure>
            </div>
          )}
        </div>
      </FocusScope>
    </SurfaceContextProvider>
  </NavigationProvider>
);

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  /** Store the caught React error and component details, then notify the optional onError callback. */
  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.setState({
      error,
      errorInfo,
    });

    // Call the onError callback if provided
    this.props.onError?.(error, errorInfo);

    // Log error to console in development
    if (import.meta.env.DEV) {
      console.error('ErrorBoundary caught an error:', error, errorInfo);
    }
  }

  resetError = (): void => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      const FallbackComponent = this.props.fallback || DefaultErrorFallback;
      return <FallbackComponent error={this.state.error} resetError={this.resetError} />;
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
