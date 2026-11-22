import type { Messages } from '../en';
import { api } from './api';
import { audio } from './audio';
import { auth } from './auth';
import { common } from './common';
import { config } from './config';
import { details } from './details';
import { home } from './home';
import { indexers } from './indexers';
import { integrations } from './integrations';
import { languages } from './languages';
import { notifications } from './notifications';
import { player } from './player';
import { playerLanguages } from './player-languages';
import { preferences } from './preferences';
import { profiles } from './profiles';
import { search } from './search';
import { server } from './server';
import { sources } from './sources';
import { storage } from './storage';
import { subtitles } from './subtitles';

export const lt: Messages = {
  ...common,
  ...api,
  ...server,
  ...integrations,
  ...notifications,
  ...search,
  ...auth,
  ...config,
  ...storage,
  ...sources,
  ...indexers,
  ...profiles,
  ...details,
  ...home,
  ...subtitles,
  ...audio,
  ...player,
  ...languages,
  ...preferences,
  ...playerLanguages,
};
