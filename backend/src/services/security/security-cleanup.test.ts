jest.mock('@logger');

import { createSecurityCleanup } from './security-cleanup';

describe('createSecurityCleanup', () => {
  it('runs every task, then fails naming the ones that failed', async () => {
    const after = jest.fn().mockResolvedValue(3);
    const cleanup = createSecurityCleanup({
      'audit logs': jest.fn().mockResolvedValue(1),
      'QR login requests': jest.fn().mockRejectedValue(new Error('locked')),
      'expired refresh tokens': after,
    });
    await expect(cleanup()).rejects.toThrow('Security cleanup failed for: QR login requests');
    expect(after).toHaveBeenCalled();
  });

  it('succeeds when every task does', async () => {
    const cleanup = createSecurityCleanup({ 'audit logs': jest.fn().mockResolvedValue(0) });
    await expect(cleanup()).resolves.toBeUndefined();
  });
});
