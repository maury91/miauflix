import { ContractError } from '@miauflix/contract';
import { mediaLoad } from '@miauflix/service-contracts';

import type { ConfigurationService } from '@services/configuration/configuration.service';
import { RemoteService } from '@services/remote/remote-service';
import { ErrorWithStatus } from '@services/source/services/error-with-status.util';

/** The torrent engine. It owns tracker scrapes today; downloads and storage move to it next. */
export class MediaLoadClientService extends RemoteService<typeof mediaLoad> {
  constructor(configuration: ConfigurationService) {
    super(configuration, {
      serviceName: 'MEDIA_LOAD',
      urlKey: 'MEDIA_LOAD_SERVICE_URL',
      timeoutKey: 'MEDIA_LOAD_SERVICE_TIMEOUT_MS',
      contract: mediaLoad,
    });
  }

  /**
   * Seeders (`broadcasters`) and leechers (`watchers`) for an info hash. Scrape failures reject
   * with `ErrorWithStatus` carrying the contract code (`scrape_timeout`, `scrape_unavailable`,
   * `invalid_hash`).
   */
  async swarmStats(hash: string): Promise<{ broadcasters: number; watchers: number }> {
    try {
      const { complete, incomplete } = await this.client.swarmStats({ hash });
      return { broadcasters: complete || 0, watchers: incomplete || 0 };
    } catch (error) {
      if (
        error instanceof ContractError &&
        ['scrape_timeout', 'scrape_unavailable', 'invalid_hash'].includes(error.code)
      ) {
        throw new ErrorWithStatus(error.message, error.code);
      }
      throw error;
    }
  }
}
