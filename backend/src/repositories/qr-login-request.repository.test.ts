jest.mock('@logger');
jest.unmock('@database/database');

import { createTestDatabase } from '@__test-utils__/database.helpers';
import { configureFakerSeed } from '@__test-utils__/utils';

import type { Database } from '@database/database';
import type { QrLoginRequestRepository } from '@repositories/qr-login-request.repository';

describe('QrLoginRequestRepository expiry boundaries', () => {
  type TestDbHelper = ReturnType<typeof createTestDatabase>;
  let cleanupHelper: TestDbHelper | undefined;
  let database: Database;
  let repository: QrLoginRequestRepository;

  beforeAll(() => {
    configureFakerSeed();
  });

  beforeEach(async () => {
    cleanupHelper = createTestDatabase();
    database = await cleanupHelper.setupTestDatabase();
    repository = database.getQrLoginRequestRepository();
    jest.useFakeTimers();
  });

  afterEach(async () => {
    await cleanupHelper?.cleanup();
    cleanupHelper = undefined;
    jest.useRealTimers();
  });

  const createRequest = (state: 'approved' | 'claiming' | 'pending', expiresAt: Date) =>
    repository.create({
      approvalTokenHash: `approval-${state}-${expiresAt.getTime()}`,
      claimTokenHash: `claim-${state}-${expiresAt.getTime()}`,
      state,
      approvedUserId: state === 'approved' || state === 'claiming' ? 'approver' : null,
      userAgent: null,
      ipAddress: null,
      expiresAt,
      approvedAt: state === 'approved' || state === 'claiming' ? new Date() : null,
      claimedAt: state === 'claiming' ? new Date() : null,
      claimLease: state === 'claiming' ? 'lease' : null,
    });

  it('checks expiry when an approval queued behind a transaction executes', async () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    jest.setSystemTime(now);
    const request = await createRequest('pending', new Date(now.getTime() + 1000));

    let release!: () => void;
    let resolveEntered!: () => void;
    const barrier = new Promise<void>(resolve => {
      release = resolve;
    });
    const transactionEntered = new Promise<void>(resolve => {
      resolveEntered = resolve;
    });
    const blockedTransaction = database.transaction(async () => {
      resolveEntered();
      await barrier;
      throw new Error('intentional rollback');
    });
    await transactionEntered;

    let settled = false;
    const approval = repository.approve(request.id, 'approver').then(result => {
      settled = true;
      return result;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    jest.setSystemTime(new Date('2026-01-01T00:00:02.000Z'));
    release();
    await expect(blockedTransaction).rejects.toThrow('intentional rollback');
    await expect(approval).resolves.toBe(false);
    expect((await repository.findByApprovalHash(request.approvalTokenHash))?.state).toBe('pending');
  });

  it('checks expiry when a queued claim begins and when a claim completes', async () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    jest.setSystemTime(now);
    const request = await createRequest('approved', new Date(now.getTime() + 1000));

    let release!: () => void;
    let resolveEntered!: () => void;
    const barrier = new Promise<void>(resolve => {
      release = resolve;
    });
    const transactionEntered = new Promise<void>(resolve => {
      resolveEntered = resolve;
    });
    const blockedTransaction = database.transaction(async () => {
      resolveEntered();
      await barrier;
      throw new Error('intentional rollback');
    });
    await transactionEntered;

    const claim = repository.beginClaim(request.id, 'new-lease');
    jest.setSystemTime(new Date('2026-01-01T00:00:02.000Z'));
    release();
    await expect(blockedTransaction).rejects.toThrow('intentional rollback');
    await expect(claim).resolves.toBeNull();
    expect((await repository.findByClaimHash(request.claimTokenHash))?.state).toBe('approved');

    const expiredClaim = await createRequest('claiming', new Date('2025-12-31T23:59:59.000Z'));
    await expect(repository.completeClaim(expiredClaim.id, 'lease')).resolves.toBe(false);
    expect((await repository.findByClaimHash(expiredClaim.claimTokenHash))?.state).toBe('claiming');
  });

  it('allows unexpired approval, claim, and completion', async () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    jest.setSystemTime(now);
    const request = await createRequest('pending', new Date(now.getTime() + 60_000));

    await expect(repository.approve(request.id, 'approver')).resolves.toBe(true);
    await expect(repository.beginClaim(request.id, 'lease')).resolves.toMatchObject({
      state: 'claiming',
      claimLease: 'lease',
    });
    await expect(repository.completeClaim(request.id, 'lease')).resolves.toBe(true);
    expect((await repository.findByClaimHash(request.claimTokenHash))?.state).toBe('claimed');
  });
});
