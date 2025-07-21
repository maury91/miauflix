import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useDeviceLoginMutation, useCheckDeviceLoginStatusMutation } from '../store/api/auth';

const DeviceLogin: React.FC = () => {
  const [getDeviceCode, { data: deviceCodeData, isLoading: isDeviceCodeLoading }] =
    useDeviceLoginMutation();
  const [checkAuthStatus, { data: authStatusData, isLoading: isAuthStatusLoading }] =
    useCheckDeviceLoginStatusMutation();
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    getDeviceCode();
  }, [getDeviceCode]);

  useEffect(() => {
    if (deviceCodeData?.deviceCode && !pollingInterval) {
      const interval = setInterval(() => {
        checkAuthStatus({ deviceCode: deviceCodeData.deviceCode });
      }, deviceCodeData.interval * 1000);
      setPollingInterval(interval);
    }

    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [deviceCodeData, checkAuthStatus, pollingInterval]);

  useEffect(() => {
    if (authStatusData) {
      if ('accessToken' in authStatusData) {
        if (pollingInterval) {
          clearInterval(pollingInterval);
        }
        // Handle successful login
        console.log('Logged in!', authStatusData);
      } else if ('error' in authStatusData) {
        // Handle errors
        if (pollingInterval) {
          clearInterval(pollingInterval);
        }
        console.error('Authentication failed:', authStatusData.error);
      }
    }
  }, [authStatusData, pollingInterval]);

  return (
    <div>
      {isDeviceCodeLoading && <p>Loading...</p>}
      {deviceCodeData && (
        <div>
          <p>Scan the QR code with your mobile device:</p>
          <QRCodeSVG value={deviceCodeData.codeUrl} />
          <p>Or enter this code: {deviceCodeData.userCode}</p>
        </div>
      )}
      {isAuthStatusLoading && <p>Waiting for authorization...</p>}
    </div>
  );
};

export default DeviceLogin;
