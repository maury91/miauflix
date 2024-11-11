import { FC, useEffect } from 'react';
import { useDeviceLoginQuery } from '../../../../store/api/users';
import { FullScreenDiv } from '../../../components/fullScreenDiv';
import { DeviceLogin } from '../components/deviceLogin';

interface NewProfileScreenProps {
  onClose: () => void;
}

export const NewProfileScreen: FC<NewProfileScreenProps> = ({ onClose }) => {
  const { data: deviceLogin, refetch } = useDeviceLoginQuery();
  const deviceLoginExpired = deviceLogin && Date.now() > deviceLogin.expiresAt;

  useEffect(() => {
    if (deviceLoginExpired) {
      refetch();
    }
  }, [deviceLoginExpired, refetch]);

  return (
    <FullScreenDiv
      key="new-profile"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {deviceLogin && (
        <DeviceLogin deviceLogin={deviceLogin} onClose={onClose} />
      )}
    </FullScreenDiv>
  );
};
