jest.mock('@database/database');

import { configureFakerSeed } from '@__test-utils__/utils';

import { Database } from '@database/database';
import type { QrLoginRequest } from '@entities/qr-login-request.entity';
import type { QrLoginRequestRepository } from '@repositories/qr-login-request.repository';

import { QrLoginService } from './qr-login.service';

const request = (overrides: Partial<QrLoginRequest> = {}): QrLoginRequest =>
  ({
    id: 'request-1',
    approvalTokenHash: 'approval-hash',
    claimTokenHash: 'claim-hash',
    state: 'approved',
    approvedUserId: 'user-1',
    userAgent: null,
    ipAddress: null,
    expiresAt: new Date(Date.now() + 60_000),
    approvedAt: new Date(),
    claimedAt: null,
    claimLease: null,
    createdAt: new Date(),
    ...overrides,
  }) as QrLoginRequest;

describe('QrLoginService claim leases', () => {
  beforeAll(() => {
    configureFakerSeed();
  });

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const setupTest = () => {
    const database = new Database({} as never) as jest.Mocked<Database>;
    const repository =
      database.getQrLoginRequestRepository() as jest.Mocked<QrLoginRequestRepository>;
    repository.findByClaimHash = jest.fn().mockResolvedValue(request());
    repository.beginClaim = jest
      .fn()
      .mockImplementation(async (_id, lease) =>
        request({ state: 'claiming', claimLease: lease, claimedAt: new Date() })
      );
    repository.completeClaim = jest.fn().mockResolvedValue(true);
    repository.releaseClaim = jest.fn().mockResolvedValue(true);
    return { service: new QrLoginService(database), repository };
  };

  it('keeps token issuance separate from final claim completion', async () => {
    const { service, repository } = setupTest();
    const claim = await service.beginClaim('claim-token', 'request-1');

    expect(claim?.request.state).toBe('claiming');
    expect(claim?.lease).toEqual(expect.any(String));
    expect(repository.beginClaim).toHaveBeenCalledWith('request-1', claim?.lease);

    await expect(service.completeClaim('request-1', claim!.lease)).resolves.toBe(true);
    expect(repository.completeClaim).toHaveBeenCalledWith('request-1', claim?.lease);
  });

  it('can release a claim when session issuance fails', async () => {
    const { service, repository } = setupTest();
    const claim = await service.beginClaim('claim-token', 'request-1');

    await expect(service.releaseClaim('request-1', claim!.lease)).resolves.toBe(true);
    expect(repository.releaseClaim).toHaveBeenCalledWith('request-1', claim?.lease);
  });

  it('does not begin a claim when the repository loses the approval race', async () => {
    const { service, repository } = setupTest();
    repository.beginClaim.mockResolvedValueOnce(null);

    await expect(service.beginClaim('claim-token', 'request-1')).resolves.toBeNull();
  });
});
