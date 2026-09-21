import { LoginWithEmail } from '@features/auth/ui/login/LoginWithEmail';
import { request } from '@shared/api/authenticated-request';
import { backendClient } from '@shared/api/backend-client';
import { useAppSelector } from '@store';
import { selectIsAuthenticated } from '@store/slices/auth';
import { useEffect, useMemo, useState } from 'react';

type ApprovalState = {
  state: 'pending' | 'approved' | 'rejected' | 'expired' | 'claimed';
  expiresAt?: string;
  device?: { userAgent: string | null };
};

export default function QrApprovalPage() {
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const token = useMemo(() => window.location.pathname.split('/').pop() ?? '', []);
  const [approval, setApproval] = useState<ApprovalState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void request(
      () => backendClient.api.auth.qr[':approvalToken'].$get({ param: { approvalToken: token } }),
      'Unable to inspect QR login request'
    ).then(result => {
      if (cancelled) return;
      if ('error' in result) setError(result.error.data);
      else setApproval(result.data as ApprovalState);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const approve = async () => {
    setBusy(true);
    const result = await request(
      () =>
        backendClient.api.auth.qr[':approvalToken'].approve.$post({
          param: { approvalToken: token },
        }),
      'Unable to approve QR login'
    );
    if ('error' in result) setError(result.error.data);
    else setApproval(current => ({ ...(current ?? { state: 'pending' }), state: 'approved' }));
    setBusy(false);
  };

  if (!isAuthenticated) {
    return (
      <main>
        <h1>Sign in to approve this device</h1>
        <LoginWithEmail showTitle={false} />
      </main>
    );
  }

  if (error)
    return (
      <main>
        <h1>QR login unavailable</h1>
        <p>{error}</p>
      </main>
    );
  if (!approval)
    return (
      <main>
        <h1>Checking login request…</h1>
      </main>
    );
  if (approval.state === 'expired' || approval.state === 'rejected') {
    return (
      <main>
        <h1>This QR login request is no longer active</h1>
      </main>
    );
  }

  return (
    <main>
      <h1>Approve Miauflix login</h1>
      <p>{approval.device?.userAgent ?? 'A new device'} is requesting access.</p>
      {approval.state === 'approved' ? (
        <p>Approved. You can return to the requesting device.</p>
      ) : (
        <button type="button" disabled={busy} onClick={approve}>
          {busy ? 'Approving…' : 'Approve device'}
        </button>
      )}
    </main>
  );
}
