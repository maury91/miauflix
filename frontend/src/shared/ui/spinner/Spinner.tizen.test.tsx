import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../config/constants', async importOriginal => ({
  ...(await importOriginal<typeof import('../../config/constants')>()),
  builtForTizen: true,
}));

import { Spinner } from './Spinner';

describe('Spinner on the Samsung TV', () => {
  it('spins an HTML element instead of the animated SVG', () => {
    render(<Spinner text="Loading..." size={24} />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(document.querySelector('svg')).toBeNull();
    const indicator = screen.getByRole('status').querySelector('span[aria-hidden="true"]');
    expect(indicator).toHaveStyle({ fontSize: '24px' });
  });
});
