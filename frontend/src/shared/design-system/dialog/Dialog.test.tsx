import { render, screen } from '@testing-library/react';

import { Dialog } from './Dialog';

describe('Dialog body', () => {
  beforeEach(() => {
    // jsdom lays nothing out: every element reports a body taller than its box
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(800);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(200);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const dialog = (open: boolean) => (
    <Dialog open={open} title="Free space" onDismiss={() => undefined}>
      <p>Long content</p>
    </Dialog>
  );

  it('joins Tab order when it overflows', () => {
    render(dialog(true));
    expect(screen.getByText('Long content').parentElement).toHaveAttribute('tabindex', '0');
  });

  // The body mounts only when the dialog opens: it is measured then, not only on first mount
  it('is measured when a dialog mounted closed opens', () => {
    const { rerender } = render(dialog(false));
    rerender(dialog(true));
    expect(screen.getByText('Long content').parentElement).toHaveAttribute('tabindex', '0');
  });
});
