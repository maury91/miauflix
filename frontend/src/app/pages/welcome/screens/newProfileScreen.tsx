import { FC, useCallback, useEffect } from 'react';
import { useDeviceLoginQuery } from '../../../../store/api/users';
import { FullScreenDiv } from '../../../components/fullScreenDiv';
import { DeviceLogin } from '../components/deviceLogin';
import { IS_TV } from '../../../../consts';
import styled from 'styled-components';
import ArrowBackRounded from '~icons/material-symbols-light/arrow-back-rounded';
import { useControls } from '../../../hooks/useControls';
import { useAppDispatch } from '../../../../store/store';
import { navigateToProfileSelection } from '../../../../store/slices/profileSelection';

const BackIcon = styled(ArrowBackRounded)`
  position: fixed;
  top: 4.5vh;
  left: 2vw;
  font-size: 5vh;
  cursor: pointer;
`;

export const NewProfileScreen: FC = () => {
  const dispatch = useAppDispatch();
  const { data: deviceLogin, refetch } = useDeviceLoginQuery();
  const deviceLoginExpired = deviceLogin && Date.now() > deviceLogin.expiresAt;
  const on = useControls('profile-selection');

  const onClose = useCallback(() => {
    dispatch(navigateToProfileSelection());
  }, [dispatch]);

  useEffect(() => {
    if (deviceLoginExpired) {
      refetch();
    }
  }, [deviceLoginExpired, refetch]);

  useEffect(() => on(['back'], onClose), [on, onClose]);

  return (
    <FullScreenDiv
      key="new-profile"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {!IS_TV && <BackIcon onClick={onClose} />}
      {deviceLogin && <DeviceLogin deviceLogin={deviceLogin} onClose={onClose} />}
    </FullScreenDiv>
  );
};
