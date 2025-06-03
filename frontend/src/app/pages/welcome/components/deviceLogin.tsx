import { FC, useEffect } from 'react';
import { useCheckDeviceLoginStatusMutation } from '../../../../store/api/users';
import styled from 'styled-components';
import QRCode, { QRCodeProps } from 'react-qr-code';
import { PALETTE } from '../../../../consts';
import { DeviceLoginDto } from '@miauflix/types';

const DeviceLoginDescription = styled.p`
  position: fixed;
  left: 10vw;
  top: 25vh;
  font-size: 3vh;
  width: 30vw;
`;
const DeviceLoginLink = styled.a`
  position: fixed;
  left: 10vw;
  top: 55vh;
  color: ${PALETTE.background.primary};
  font-size: 3.5vh;
`;
const DeviceLoginQRCode = styled(QRCode as unknown as FC<QRCodeProps>)`
  position: fixed;
  right: 10vw;
  top: 25vh;
  padding: 2vw;
  background: white;
  border-radius: 1vw;
`;

interface DeviceLoginProps {
  deviceLogin: DeviceLoginDto;
  onClose: () => void;
}

export const DeviceLogin: FC<DeviceLoginProps> = ({ deviceLogin, onClose }) => {
  const [checkDeviceLoginStatus] = useCheckDeviceLoginStatusMutation();

  useEffect(() => {
    const interval = setInterval(async () => {
      const result = await checkDeviceLoginStatus(deviceLogin.deviceCode);
      if (result.data?.loggedIn) {
        onClose();
      }
    }, deviceLogin.interval * 1000);

    return () => {
      clearInterval(interval);
    };
  }, [checkDeviceLoginStatus, deviceLogin.deviceCode, deviceLogin.interval, onClose]);

  return (
    <>
      <DeviceLoginDescription>
        To login go to the link below or scan the QR code
      </DeviceLoginDescription>
      <DeviceLoginLink href={deviceLogin?.codeUrl} target="_blank">
        {deviceLogin?.codeUrl?.replace('https://', '')}
      </DeviceLoginLink>
      <DeviceLoginQRCode value={deviceLogin?.codeUrl ?? ''} />
    </>
  );
};
