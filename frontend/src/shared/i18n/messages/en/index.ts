import type { PluralMessage } from '../types';
import { api } from './api';
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

/** Every English message: the source catalog other languages translate. */
export const en = {
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
  ...player,
  ...languages,
  ...preferences,
  ...playerLanguages,
};

export type MessageKey = keyof typeof en;

/** A full catalog in one language. */
export type Messages = {
  [Key in MessageKey]: (typeof en)[Key] extends string ? string : PluralMessage;
};
