import { FC, useCallback, useEffect, useState } from 'react';
import {
  FocusContext,
  setFocus,
  useFocusable,
} from '@noriginmedia/norigin-spatial-navigation';
import QRCode, { QRCodeProps } from 'react-qr-code';
import { NEW_PROFILE_ITEM, PROFILE_ITEM_PREFIX } from './consts';
import styled from 'styled-components';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import { useProfileSelectionNavigation } from './hooks/useProfileSelectionNavigation';
import {
  useCheckDeviceLoginStatusMutation,
  useDeviceLoginQuery,
  useGetUsersQuery,
} from '../../../store/api/users';
import { useNavigation } from '../../hooks/useNavigation';
import { ProfileSelectionScreen } from './screens/profileSelectionScreen';
import { FullScreenDiv } from '../../components/fullScreenDiv';
import { PALETTE } from '../../../consts';
import { DeviceLoginDto } from '@miauflix/types';

export const ProfileSelectionContainer = styled(motion.div)`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  bottom: 0;
`;

interface NewProfileScreenProps {
  onClose: () => void;
}

const DeviceLoginDescription = styled.p`
  position: fixed;
  left: 10vw;
  top: 25vh;
  font-size: max(2vw, 2vh);
  width: 30vw;
`;

const DeviceLoginLink = styled.a`
  position: fixed;
  left: 10vw;
  top: 55vh;
  color: ${PALETTE.background.primary};
  font-size: max(3vw, 3vh);
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

const DeviceLogin: FC<DeviceLoginProps> = ({ deviceLogin, onClose }) => {
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
  }, [
    checkDeviceLoginStatus,
    deviceLogin.deviceCode,
    deviceLogin.interval,
    onClose,
  ]);

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

const NewProfileScreen: FC<NewProfileScreenProps> = ({ onClose }) => {
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

export const ProfileSelection = () => {
  const [newProfileOpen, setNewProfileOpen] = useState(false);
  const { data: users } = useGetUsersQuery();
  const { focusKey } = useFocusable({
    saveLastFocusedChild: true,
  });

  const hasProfiles = users && users.length > 0;

  const closeNewProfile = useCallback(() => {
    setNewProfileOpen(false);
  }, []);

  useEffect(() => {
    setFocus(hasProfiles ? `${PROFILE_ITEM_PREFIX}0` : NEW_PROFILE_ITEM);
  }, [hasProfiles]);

  useNavigation({
    page: 'profile-selection',
    onBack: () => {
      setNewProfileOpen(false);
      setFocus(NEW_PROFILE_ITEM);
    },
  });

  const openNewProfile = useCallback(() => {
    setNewProfileOpen(true);
  }, []);

  const navigateTo = useProfileSelectionNavigation({
    openNewProfile,
  });

  return (
    <FocusContext.Provider value={focusKey}>
      <MotionConfig transition={{ duration: 0.3 }}>
        <AnimatePresence initial={false} mode="wait">
          {newProfileOpen ? (
            <NewProfileScreen onClose={closeNewProfile} />
          ) : (
            <ProfileSelectionScreen navigateTo={navigateTo} users={users} />
          )}
        </AnimatePresence>
      </MotionConfig>
    </FocusContext.Provider>
  );
};
