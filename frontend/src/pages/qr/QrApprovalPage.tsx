import { authApi } from '@features/auth/api/auth.api';
import { describeDevice, type DeviceDescription } from '@features/auth/lib/describeDevice';
import { formatTimeRemaining } from '@features/auth/lib/formatTimeRemaining';
import { LoginWithEmail } from '@features/auth/ui/login/LoginWithEmail';
import { authenticatedRequest, request } from '@shared/api/authenticated-request';
import { backendClient } from '@shared/api/backend-client';
import { Alert, Button, PALETTE, Spinner } from '@shared/ui';
import { NARROW_MAX_WIDTH_PX } from '@shared/ui/logo/logoGeometry';
import { useAppDispatch, useAppSelector } from '@store';
import { clearAuth, selectCurrentSessionId, selectIsAuthenticated } from '@store/slices/auth';
import { type ComponentType, type ReactNode, useCallback, useEffect, useState } from 'react';
import styled from 'styled-components';

import PhoneIcon from '~icons/mdi/cellphone';
import CheckIcon from '~icons/mdi/check-circle-outline';
import ExpiredIcon from '~icons/mdi/clock-alert-outline';
import DeclinedIcon from '~icons/mdi/close-circle-outline';
import LaptopIcon from '~icons/mdi/laptop';
import DeviceIcon from '~icons/mdi/monitor';
import TvIcon from '~icons/mdi/television';

type RequestState = 'pending' | 'approved' | 'rejected' | 'expired' | 'claimed';

interface ApprovalRequest {
  state: RequestState;
  expiresAt?: string;
  device?: { userAgent: string | null };
}

type Phase =
  | { kind: 'checking' }
  | { kind: 'missing' }
  | { kind: 'failed'; message: string }
  | { kind: 'request'; request: ApprovalRequest };

/**
 * Starts below the app's logo, which stays where the login screen has it: 130px tall at
 * 50% - 380px (70px tall at 50px on narrow screens).
 */
const Screen = styled.main`
  position: fixed;
  top: 0;
  left: 0;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100vw;
  height: 100vh;
  padding: calc(50vh - 218px) 16px 32px;
  overflow-y: auto;
  background: ${PALETTE.background.primary};
  color: ${PALETTE.text.primary};
  font-family: 'Poppins', sans-serif;

  /* Short screens push the logo off the top; keep the card from touching the edge */
  @media (max-height: 500px) {
    padding-top: 32px;
  }

  @media (max-width: ${NARROW_MAX_WIDTH_PX}px) {
    padding-top: 152px;
  }
`;

const Column = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  max-width: 440px;
`;

const Card = styled.section`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 32px 24px;
  border: 1px solid ${PALETTE.background.border};
  border-radius: 16px;
  background: ${PALETTE.background.surface1};
  text-align: center;
`;

const Badge = styled.div<{ $tone: 'brand' | 'success' | 'muted' }>`
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: ${({ $tone }) =>
    $tone === 'success'
      ? 'rgba(66, 184, 131, 0.16)'
      : $tone === 'brand'
        ? PALETTE.color.interactiveSubtle
        : PALETTE.background.surface2};
  color: ${({ $tone }) =>
    $tone === 'success'
      ? PALETTE.color.success
      : $tone === 'brand'
        ? PALETTE.color.brand
        : PALETTE.text.secondary};

  svg {
    width: 32px;
    height: 32px;
  }
`;

const Title = styled.h1`
  margin: 0;
  font-size: 24px;
  font-weight: 500;
  line-height: 1.3;
`;

const Text = styled.p`
  margin: 0;
  color: ${PALETTE.text.secondary};
  font-size: 15px;
  line-height: 1.5;
`;

const Device = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 16px;
  border-radius: 12px;
  background: ${PALETTE.background.surface2};
  text-align: left;

  svg {
    flex: none;
    width: 28px;
    height: 28px;
    color: ${PALETTE.text.secondary};
  }
`;

const DeviceName = styled.span`
  display: block;
  font-weight: 500;
`;

const DeviceMeta = styled.span`
  display: block;
  color: ${PALETTE.text.muted};
  font-size: 13px;
`;

const Actions = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
`;

/** The login form, without its own panel (the login page's), as part of the card. */
const SignInForm = styled.div`
  width: 100%;
  margin-top: 8px;
  text-align: left;

  > div {
    min-height: 0;
    padding: 0;
    border: 0;
    background: none;
  }
`;

const DEVICE_ICONS: Record<DeviceDescription['kind'], ComponentType> = {
  tv: TvIcon,
  phone: PhoneIcon,
  computer: LaptopIcon,
  unknown: DeviceIcon,
};

function useSecondsLeft(expiresAt: string | undefined): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);
  if (!expiresAt) return null;
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000));
}

function DeviceRow({
  request,
  secondsLeft,
}: {
  request: ApprovalRequest;
  secondsLeft: number | null;
}) {
  const device = describeDevice(request.device?.userAgent);
  const Icon = DEVICE_ICONS[device.kind];
  return (
    <Device>
      <Icon aria-hidden="true" />
      <span>
        <DeviceName>{device.name}</DeviceName>
        {secondsLeft !== null && (
          <DeviceMeta>Code expires in {formatTimeRemaining(secondsLeft)}</DeviceMeta>
        )}
      </span>
    </Device>
  );
}

function Outcome({
  icon,
  tone,
  title,
  children,
}: {
  icon: ReactNode;
  tone: 'brand' | 'success' | 'muted';
  title: string;
  children: ReactNode;
}) {
  return (
    <Card aria-live="polite">
      <Badge $tone={tone} aria-hidden="true">
        {icon}
      </Badge>
      <Title>{title}</Title>
      <Text>{children}</Text>
    </Card>
  );
}

/** Approve, from a signed-in browser, a device that shows a QR login code (e.g. the TV app). */
export default function QrApprovalPage({ approvalToken }: { approvalToken: string }) {
  const dispatch = useAppDispatch();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const sessionId = useAppSelector(selectCurrentSessionId);
  const [phase, setPhase] = useState<Phase>({ kind: 'checking' });
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);

  const inspect = useCallback(async () => {
    const result = await request<ApprovalRequest>(
      () => backendClient.api.auth.qr[':approvalToken'].$get({ param: { approvalToken } }),
      'Unable to check this sign-in request'
    );
    if (!('error' in result)) setPhase({ kind: 'request', request: result.data });
    else if (result.error.status === 404) setPhase({ kind: 'missing' });
    else setPhase({ kind: 'failed', message: result.error.data });
  }, [approvalToken]);

  useEffect(() => {
    void inspect();
  }, [inspect]);

  const currentRequest = phase.kind === 'request' ? phase.request : null;
  const secondsLeft = useSecondsLeft(
    currentRequest?.state === 'pending' ? currentRequest.expiresAt : undefined
  );
  const expired =
    currentRequest?.state === 'expired' ||
    (currentRequest?.state === 'pending' && secondsLeft === 0);

  const decide = async (decision: 'approve' | 'reject') => {
    setBusy(decision);
    setActionError(null);
    // The approval is made by this browser's session, so the backend needs to know which one
    const headers: Record<string, string> = sessionId ? { 'X-Session-Id': sessionId } : {};
    const endpoint = backendClient.api.auth.qr[':approvalToken'];
    const result = await authenticatedRequest<{ state: 'approved' | 'rejected' }>({
      requestFn: () => endpoint[decision].$post({ param: { approvalToken } }, { headers }),
      session: sessionId,
      errorContext:
        decision === 'approve'
          ? 'Unable to approve this sign-in'
          : 'Unable to decline this sign-in',
      onInvalidSession: () => {
        dispatch(clearAuth());
        dispatch(authApi.endpoints.listSessions.initiate(undefined, { forceRefetch: true }));
      },
    });
    setBusy(null);
    if (!('error' in result)) {
      setPhase(current =>
        current.kind === 'request'
          ? { kind: 'request', request: { ...current.request, state: result.data.state } }
          : current
      );
    } else if (result.error.status === 409) {
      // Approved, declined or expired meanwhile: show what it is now
      await inspect();
    } else {
      setActionError(result.error.data);
    }
  };

  const content = (() => {
    if (phase.kind === 'checking')
      return (
        <Card>
          <Spinner text="Checking the sign-in request…" />
        </Card>
      );
    if (phase.kind === 'failed')
      return (
        <Card>
          <Title>Something went wrong</Title>
          <Alert severity="error">{phase.message}</Alert>
          <Button type="button" color="secondary" fullWidth onClick={() => void inspect()}>
            Try again
          </Button>
        </Card>
      );
    if (phase.kind === 'missing' || expired)
      return (
        <Outcome icon={<ExpiredIcon />} tone="muted" title="This code has expired">
          Show a new QR code on your device and scan it again.
        </Outcome>
      );
    const { request: current } = phase;
    if (current.state === 'approved' || current.state === 'claimed')
      return (
        <Outcome icon={<CheckIcon />} tone="success" title="Approved">
          {describeDevice(current.device?.userAgent).name} is signing in. You can close this page.
        </Outcome>
      );
    if (current.state === 'rejected')
      return (
        <Outcome icon={<DeclinedIcon />} tone="muted" title="Sign-in declined">
          The device was not signed in. You can close this page.
        </Outcome>
      );
    if (!isAuthenticated)
      return (
        <Card>
          <Title>Sign in to continue</Title>
          <Text>Sign in to your Miauflix account here to approve this device.</Text>
          <DeviceRow request={current} secondsLeft={secondsLeft} />
          <SignInForm>
            <LoginWithEmail showTitle={false} />
          </SignInForm>
        </Card>
      );
    return (
      <Card>
        <Badge $tone="brand" aria-hidden="true">
          <TvIcon />
        </Badge>
        <Title>Sign in on this device?</Title>
        <Text>Only approve a device you are setting up yourself. It will use your account.</Text>
        <DeviceRow request={current} secondsLeft={secondsLeft} />
        {actionError && <Alert severity="error">{actionError}</Alert>}
        <Actions>
          <Button
            type="button"
            size="large"
            fullWidth
            disabled={busy !== null}
            onClick={() => void decide('approve')}
          >
            {busy === 'approve' ? 'Approving…' : 'Approve'}
          </Button>
          <Button
            type="button"
            color="secondary"
            fullWidth
            disabled={busy !== null}
            onClick={() => void decide('reject')}
          >
            {busy === 'reject' ? 'Declining…' : 'Decline'}
          </Button>
        </Actions>
      </Card>
    );
  })();

  return (
    <Screen aria-label="Approve sign-in">
      <Column>{content}</Column>
    </Screen>
  );
}
