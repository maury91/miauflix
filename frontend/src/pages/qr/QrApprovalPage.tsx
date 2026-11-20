import { authApi } from '@features/auth/api/auth.api';
import { describeDevice, type DeviceDescription } from '@features/auth/lib/describeDevice';
import { formatTimeRemaining } from '@features/auth/lib/formatTimeRemaining';
import { LoginWithEmail } from '@features/auth/ui/login/LoginWithEmail';
import { authenticatedRequest, request } from '@shared/api/authenticated-request';
import { backendClient } from '@shared/api/backend-client';
import {
  ActionGroup,
  Button,
  Heading,
  Icon,
  List,
  ListItem,
  Message,
  ProgressSpinner,
  Stack,
  Surface,
  SurfaceContextProvider,
  Text,
} from '@shared/design-system';
import { FocusScope, NavigationProvider } from '@shared/navigation';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import {
  selectCurrentSessionId,
  selectIsAuthenticated,
  selectProfiles,
  sessionRemoved,
  setSession,
} from '@store/slices/auth';
import { type ComponentType, type ReactNode, useCallback, useEffect, useState } from 'react';

import * as styles from './qrApprovalPage.css';

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

const NAV = {
  approve: 'qr-approve',
  decline: 'qr-decline',
  retry: 'qr-retry',
} as const;

type Phase =
  | { kind: 'checking' }
  | { kind: 'missing' }
  | { kind: 'failed'; message: string }
  | { kind: 'request'; request: ApprovalRequest };

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
  const DeviceIcon = DEVICE_ICONS[device.kind];
  return (
    <List label="Device">
      <ListItem
        leading={
          <Icon size="lg">
            <DeviceIcon />
          </Icon>
        }
        title={device.name}
        description={
          secondsLeft !== null ? `Code expires in ${formatTimeRemaining(secondsLeft)}` : undefined
        }
      />
    </List>
  );
}

/** A centred card: the picture, the title, what it means. */
function Card({
  mark,
  tone = 'muted',
  live,
  children,
}: {
  mark?: ReactNode;
  tone?: 'success' | 'neutral' | 'muted';
  live?: boolean;
  children: ReactNode;
}) {
  return (
    <Surface as="section" border radius="lg" padding="xl">
      <div aria-live={live ? 'polite' : undefined}>
        <Stack gap="md">
          {mark && (
            <div className={styles.markRow}>
              <span className={styles.mark} data-tone={tone} aria-hidden="true">
                <Icon size="lg">{mark}</Icon>
              </span>
            </div>
          )}
          {children}
        </Stack>
      </div>
    </Surface>
  );
}

function Outcome({
  icon,
  tone,
  title,
  children,
}: {
  icon: ReactNode;
  tone: 'success' | 'muted';
  title: string;
  children: ReactNode;
}) {
  return (
    <Card mark={icon} tone={tone} live>
      <Heading level={1} variant="heading" align="center">
        {title}
      </Heading>
      <Text tone="secondary" align="center">
        {children}
      </Text>
    </Card>
  );
}

/** Approve, from a signed-in browser, a device that shows a QR login code (e.g. the TV app). */
export default function QrApprovalPage({ approvalToken }: { approvalToken: string }) {
  const dispatch = useAppDispatch();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const currentSessionId = useAppSelector(selectCurrentSessionId);
  const profiles = useAppSelector(selectProfiles);
  // A new tab has no profile chosen yet (that lasts for one app run), and signing in here only
  // adds one: the device's only profile approves, or the user picks which of them does.
  const sessionId =
    isAuthenticated && currentSessionId
      ? currentSessionId
      : profiles.length === 1
        ? profiles[0]!.session
        : null;
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
        if (sessionId) dispatch(sessionRemoved(sessionId));
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
          <div className={styles.markRow}>
            <ProgressSpinner size="lg" label="Checking the sign-in request…" />
          </div>
        </Card>
      );
    if (phase.kind === 'failed')
      return (
        <Card>
          <Heading level={1} variant="heading" align="center">
            Something went wrong
          </Heading>
          <Message tone="danger" toneLabel="Error" live="assertive">
            {phase.message}
          </Message>
          <ActionGroup layout="column">
            <Button navId={NAV.retry} fullWidth onClick={() => void inspect()}>
              Try again
            </Button>
          </ActionGroup>
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
    if (!sessionId && profiles.length > 1)
      return (
        <Card>
          <Heading level={1} variant="heading" align="center">
            Who is approving?
          </Heading>
          <Text tone="secondary" align="center">
            Choose the profile that signs this device in.
          </Text>
          <DeviceRow request={current} secondsLeft={secondsLeft} />
          <ActionGroup layout="column" label="Profiles">
            {profiles.map(profile => (
              <Button
                key={profile.session}
                navId={`qr-profile:${profile.user.id}`}
                fullWidth
                onClick={() => dispatch(setSession(profile.session))}
              >
                {profile.user.displayName || profile.user.email}
              </Button>
            ))}
          </ActionGroup>
        </Card>
      );
    if (!sessionId)
      return (
        <Card>
          <Heading level={1} variant="heading" align="center">
            Sign in to continue
          </Heading>
          <Text tone="secondary" align="center">
            Sign in to your Miauflix account here to approve this device.
          </Text>
          <DeviceRow request={current} secondsLeft={secondsLeft} />
          <div className={styles.signIn}>
            <LoginWithEmail showTitle={false} />
          </div>
        </Card>
      );
    return (
      <Card mark={<TvIcon />} tone="neutral">
        <Heading level={1} variant="heading" align="center">
          Sign in on this device?
        </Heading>
        <Text tone="secondary" align="center">
          Only approve a device you are setting up yourself. It will use your account.
        </Text>
        <DeviceRow request={current} secondsLeft={secondsLeft} />
        {actionError && (
          <Message tone="danger" toneLabel="Error" live="assertive">
            {actionError}
          </Message>
        )}
        <ActionGroup layout="column">
          <Button
            navId={NAV.approve}
            size="lg"
            fullWidth
            loading={busy === 'approve'}
            disabled={busy === 'reject'}
            onClick={() => void decide('approve')}
          >
            Approve
          </Button>
          <Button
            navId={NAV.decline}
            fullWidth
            loading={busy === 'reject'}
            disabled={busy === 'approve'}
            onClick={() => void decide('reject')}
          >
            Decline
          </Button>
        </ActionGroup>
      </Card>
    );
  })();

  return (
    <main className={styles.screen} aria-label="Approve sign-in">
      <NavigationProvider>
        <SurfaceContextProvider value="solid">
          <FocusScope>
            <div className={styles.column}>{content}</div>
          </FocusScope>
        </SurfaceContextProvider>
      </NavigationProvider>
    </main>
  );
}
