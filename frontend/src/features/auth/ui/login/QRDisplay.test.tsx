import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { QRDisplay } from './QRDisplay';

describe('QRDisplay', () => {
  const defaultProps = {
    codeUrl: 'https://miauflix.local/auth/device?code=ABC123DEF456',
    userCode: 'ABC123DEF456',
    timeRemaining: 600,
  };

  const loadingProps = {
    isLoading: true,
    qrSize: 140,
  };

  it('should render the default QR display correctly', () => {
    render(<QRDisplay {...defaultProps} />);

    // Check that QR code is present
    expect(screen.getByLabelText('Login QR code')).toBeInTheDocument();

    // Check that user code is formatted and displayed
    expect(screen.getByText('ABC1 23DEF456')).toBeInTheDocument();

    // Check that instructions are displayed
    expect(screen.getByText('Scan with phone to sign in')).toBeInTheDocument();

    // Check that time remaining is shown
    expect(screen.getByText(/Expires in/)).toBeInTheDocument();
    expect(screen.getByText('10:00')).toBeInTheDocument();
  });

  it('should show countdown when about to expire', () => {
    render(<QRDisplay {...defaultProps} timeRemaining={30} />);

    expect(screen.getByText('0:30')).toBeInTheDocument();
    expect(screen.getByText(/Expires in/)).toBeInTheDocument();
  });

  it('should show expired message when time runs out', () => {
    render(<QRDisplay {...defaultProps} timeRemaining={0} />);

    expect(screen.getByText('Code expired')).toBeInTheDocument();
    expect(screen.queryByText(/Expires in/)).not.toBeInTheDocument();
  });

  it('should display custom instructions', () => {
    render(
      <QRDisplay
        {...defaultProps}
        instructions="Use your mobile device to scan this QR code and authenticate"
      />
    );

    expect(
      screen.getByText('Use your mobile device to scan this QR code and authenticate')
    ).toBeInTheDocument();
  });

  it('should be accessible', () => {
    render(<QRDisplay {...defaultProps} />);

    // QR code should have proper aria-label
    const qrCode = screen.getByLabelText('Login QR code');
    expect(qrCode).toBeInTheDocument();
  });

  it('should render different QR sizes correctly', () => {
    const { rerender } = render(<QRDisplay {...defaultProps} qrSize={100} />);

    // Small size should render
    expect(screen.getByLabelText('Login QR code')).toBeInTheDocument();

    // Rerender with large size
    rerender(<QRDisplay {...defaultProps} qrSize={200} />);
    expect(screen.getByLabelText('Login QR code')).toBeInTheDocument();
  });

  it('should render loading state with spinner and skeleton', () => {
    render(<QRDisplay {...loadingProps} />);

    // Should have spinner but no text
    expect(document.querySelector('svg')).toBeInTheDocument();

    // Should not have QR code when loading
    expect(screen.queryByLabelText('Login QR code')).not.toBeInTheDocument();
  });
});
