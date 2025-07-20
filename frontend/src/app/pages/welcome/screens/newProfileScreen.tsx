import { FC, useCallback, useEffect } from 'react';
import { FullScreenDiv } from '../../../components/fullScreenDiv';
import { DeviceLogin } from '../components/deviceLogin';
import { IS_TV } from '../../../../consts';
import styled from 'styled-components';
import ArrowBackRounded from '~icons/material-symbols-light/arrow-back-rounded';
import { useControls } from '../../../hooks/useControls';
import { useAppDispatch } from '../../../../store/store';
import { navigateToProfileSelection } from '../../../../store/slices/profileSelection';
import { useDeviceLoginMutation } from '@/store/api/auth';

const BackIcon = styled(ArrowBackRounded)`
  position: fixed;
  top: 4.5vh;
  left: 2vw;
  font-size: 5vh;
  cursor: pointer;
`;

export const NewProfileScreen: FC = () => {
  const dispatch = useAppDispatch();
  const [getDeviceCode, { data: deviceLogin }] = useDeviceLoginMutation();
  const deviceLoginExpired = deviceLogin && Date.now() > deviceLogin.expiresIn * 1000;
  const on = useControls('profile-selection');

  const onClose = useCallback(() => {
    dispatch(navigateToProfileSelection());
  }, [dispatch]);

  useEffect(() => {
    if (deviceLoginExpired) {
      getDeviceCode();
    }
  }, [deviceLoginExpired, getDeviceCode]);

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
