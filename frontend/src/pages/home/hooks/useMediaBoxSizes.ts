import { useSelector } from 'react-redux';

import { selectMediaBoxSizes } from '../home-layout';

/** Card sizes for Home rows at the current window size. */
export const useMediaBoxSizes = () => useSelector(selectMediaBoxSizes);
