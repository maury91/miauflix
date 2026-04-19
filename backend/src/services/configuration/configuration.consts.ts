import { theRarbgConfigurationDefinition } from '@content-directories/therarbg/therarbg.configuration';
import { ytsConfigurationDefinition } from '@content-directories/yts/yts.configuration';
import { jwtConfigurationDefinition } from '@services/auth/auth.configuration';
import { serverConfigurationDefinition } from '@services/configuration/configuration.configuration';
import { tmdbConfigurationDefinition } from '@services/content-catalog/tmdb/tmdb.configuration';
import { traktConfigurationDefinition } from '@services/content-catalog/trakt/trakt.configuration';
import { downloadConfigurationDefinition } from '@services/download/download.configuration';
import { vpnConfigurationDefinition } from '@services/security/vpn.configuration';
import { sourceConfigurationDefinition } from '@services/source/source.configuration';
import { storageConfigurationDefinition } from '@services/storage/storage.configuration';
import { objectKeys } from '@utils/object.util';

export const services = {
  JWT: jwtConfigurationDefinition,
  SERVER: serverConfigurationDefinition,
  SOURCE: sourceConfigurationDefinition,
  THE_RARBG: theRarbgConfigurationDefinition,
  TMDB: tmdbConfigurationDefinition,
  TRAKT: traktConfigurationDefinition,
  VPN: vpnConfigurationDefinition,
  YTS: ytsConfigurationDefinition,
  DOWNLOAD: downloadConfigurationDefinition,
  STORAGE: storageConfigurationDefinition,
};

export const ALL_VAR_NAMES = new Set(Object.values(services).flatMap(s => objectKeys(s.variables)));
export const ALL_SERVICE_NAMES = new Set(objectKeys(services));
