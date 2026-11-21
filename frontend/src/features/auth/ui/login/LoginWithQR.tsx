import { useClaimQrLoginMutation, useCreateQrLoginMutation } from '@features/auth/api/auth.api';
import { formatTimeRemaining } from '@features/auth/lib/formatTimeRemaining';
import { qrApprovalUrl } from '@features/auth/lib/qrApprovalUrl';
import { Button, Message, PairingPanel } from '@shared/design-system';
import { useT } from '@shared/i18n';
import { useNavigation } from '@shared/navigation';
import type { FC } from 'react';
import { useEffect, useRef, useState } from 'react';
import QRCode from 'react-qr-code';

import { LOGIN_NAV } from './loginNav';

/** Fills the panel's white tile; the SVG scales by its view box. */
const qrStyle = { width: '100%', height: '100%' };

/**
 * Sign in by scanning a code with a signed-in phone: the design system's PairingPanel. This
 * feature requests the code, polls for the approval and counts down to its expiry; once it
 * expired (or the request failed) the panel offers a new one.
 */
export const LoginWithQR: FC<{
  /** Where focus goes after asking for a new code, whose button then goes away. */
  focusAfterNewCode?: string;
}> = ({ focusAfterNewCode }) => {
  const t = useT();
  const [createQrLogin, { data: qrData, isLoading: isQrLoading, isError: isQrError }] =
    useCreateQrLoginMutation();
  const [claimQrLogin] = useClaimQrLoginMutation();
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const lastAuthStatusCheck = useRef<number>(0);
  const navigation = useNavigation();

  useEffect(() => {
    createQrLogin();
  }, [createQrLogin]);

  useEffect(() => {
    if (qrData) {
      // Not 0 (shown as expired) until the first tick
      setTimeRemaining(
        Math.max(0, Math.floor((new Date(qrData.expiresAt).getTime() - Date.now()) / 1000))
      );
      const interval = setInterval(async () => {
        const remainingTime = qrData
          ? Math.max(0, Math.floor((new Date(qrData.expiresAt).getTime() - Date.now()) / 1000))
          : 0;
        setTimeRemaining(remainingTime);
        if (remainingTime <= 0) {
          clearInterval(interval);
        } else if (qrData) {
          if (Date.now() - lastAuthStatusCheck.current > qrData.pollInterval * 1000) {
            lastAuthStatusCheck.current = Date.now();
            try {
              const authStatus = await claimQrLogin({
                requestId: qrData.requestId,
                claimToken: qrData.claimToken,
              }).unwrap();
              if ('session' in authStatus) {
                clearInterval(interval);
              } else if (new Date(qrData.expiresAt).getTime() - Date.now() < 0) {
                clearInterval(interval);
              }
            } catch (error) {
              console.error('Error checking auth status:', error);
            }
          }
        }
      }, 1000);

      return () => {
        clearInterval(interval);
      };
    }
    return () => {};
  }, [claimQrLogin, qrData]);

  const requestNewCode = () => {
    createQrLogin();
    if (focusAfterNewCode) navigation.focus(focusAfterNewCode);
  };

  const expired = isQrError || (Boolean(qrData) && timeRemaining <= 0);
  const state = isQrLoading || (!qrData && !isQrError) ? 'loading' : expired ? 'expired' : 'ready';

  return (
    <PairingPanel
      navId={LOGIN_NAV.qrPanel}
      fill
      title={t('auth.qrTitle')}
      instructions={t('auth.qrInstructions')}
      state={state}
      loadingLabel={t('auth.gettingCode')}
      qr={
        qrData ? (
          <QRCode
            value={qrApprovalUrl(qrData.approvalPath)}
            level="M"
            style={qrStyle}
            aria-label={t('auth.qrLabel')}
          />
        ) : undefined
      }
      status={
        state === 'ready'
          ? t('auth.expiresIn', { time: formatTimeRemaining(timeRemaining) })
          : undefined
      }
      message={
        state === 'expired' ? (
          <Message
            tone={isQrError ? 'danger' : 'info'}
            toneLabel={isQrError ? t('common.error') : undefined}
          >
            {t(isQrError ? 'auth.qrFailed' : 'auth.codeExpired')}
          </Message>
        ) : undefined
      }
      actions={
        state === 'expired' ? (
          <Button navId={LOGIN_NAV.qrNewCode} onClick={requestNewCode}>
            {t('auth.newCode')}
          </Button>
        ) : undefined
      }
    />
  );
};
