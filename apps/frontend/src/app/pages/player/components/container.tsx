import { FC } from 'react';
import { IS_TIZEN } from '../../../../consts';
import { TizenPlayerContainer } from './players/tizen';

export const PlayerContainer: FC<{ url: string }> = () => {
  if (IS_TIZEN) {
    return <TizenPlayerContainer type={'application/avplayer'} />;
  }
  return null;
};
