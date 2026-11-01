import { forgetAllTvSessions } from '@shared/api/tv-auth';
import { readTvServer, writeTvServer } from '@shared/config/tv-server';

/** Restart the app at its start page: the backend address is read once, at startup. */
function restartApp(): void {
  window.location.replace(window.location.pathname);
}

/** Use `url` as the TV's server from now on; the sessions of another server are dropped. */
export function connectTvServer(url: string): void {
  if (readTvServer() !== url) forgetAllTvSessions();
  writeTvServer(url);
  restartApp();
}

/** Sign out of the current server and pick another one. */
export function changeTvServer(): void {
  forgetAllTvSessions();
  writeTvServer(null);
  restartApp();
}
