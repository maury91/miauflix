import type { ComponentType, ReactNode } from 'react';
import { Component } from 'react';
import styled from 'styled-components';

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

const ErrorContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  padding: 2rem;
  text-align: center;
  background-color: #1a1a1a;
  color: #ffffff;
  border-radius: 8px;
  margin: 1rem;
`;

const ErrorTitle = styled.h2`
  color: #ff4444;
  margin-bottom: 1rem;
  font-size: 1.5rem;
`;

const ErrorMessage = styled.p`
  color: #cccccc;
  margin-bottom: 1rem;
  max-width: 600px;
  line-height: 1.5;
`;

const ErrorDetails = styled.details`
  margin-top: 1rem;
  text-align: left;
  max-width: 600px;
  width: 100%;
`;

const ErrorSummary = styled.summary`
  cursor: pointer;
  color: #888888;
  margin-bottom: 0.5rem;
`;

const ErrorStack = styled.pre`
  background-color: #2a2a2a;
  padding: 1rem;
  border-radius: 4px;
  overflow-x: auto;
  font-size: 0.875rem;
  color: #ff6666;
`;

const RetryButton = styled.button`
  background-color: #db202c;
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 4px;
  font-size: 1rem;
  cursor: pointer;
  margin-top: 1rem;
  transition: background-color 0.2s;

  &:hover {
    background-color: #c01e28;
  }
`;

const DefaultErrorFallback: ComponentType<{ error?: Error; resetError: () => void }> = ({
  error,
  resetError,
}) => (
  <ErrorContainer>
    <ErrorTitle>Something went wrong</ErrorTitle>
    <ErrorMessage>
      We're sorry, but something unexpected happened. Please try refreshing the page or contact
      support if the problem persists.
    </ErrorMessage>
    {error && (
      <ErrorDetails>
        <ErrorSummary>Technical Details</ErrorSummary>
        <ErrorStack>{error.stack}</ErrorStack>
      </ErrorDetails>
    )}
    <RetryButton onClick={resetError}>Try Again</RetryButton>
  </ErrorContainer>
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

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.setState({
      error,
      errorInfo,
    });

    // Call the onError callback if provided
    this.props.onError?.(error, errorInfo);

    // Log error to console in development
    if (process.env['NODE_ENV'] === 'development') {
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
