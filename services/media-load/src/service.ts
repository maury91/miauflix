import { type CallContext, defineService, type Service } from '@miauflix/contract';
import { mediaLoad } from '@miauflix/service-contracts';
import { VpnGuard, vpnSettingsFrom } from '@miauflix/vpn-guard';

import { MediaLoadConfigService } from './config/config.service';
import { InvalidSettingsError } from './engine/engine-config';
import { ErrorWithStatus } from './lib/errors';
import { ScrapeBatcher, type ScrapeBatcherOptions, ScrapeError } from './scrape/scrape-batcher';
import { MediaLoadRuntime } from './runtime';

export interface MediaLoadServiceOptions {
  /** Directory of the service database; `:memory:` keeps it in memory (tests). */
  dataDir?: string;
  /** Default advertised to the backend when no download path is configured. */
  defaultDownloadPath?: string;
  /** An extra mount for importing legacy downloads recorded under a different path. */
  legacyDownloadPath?: string;
  /** Scrape timing, for tests. */
  scrape?: ScrapeBatcherOptions;
  /** Fetches the VPN check's JSON, for tests. */
  vpnFetchJson?: (url: string, init: { signal?: AbortSignal }) => Promise<unknown>;
}

/** Runs an engine call, turning its coded failures into contract errors. */
const engineCall = async <T, E extends string>(
  ctx: CallContext<E>,
  run: () => Promise<T> | T
): Promise<T> => {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ErrorWithStatus) return ctx.fail(error.status as E, error.message);
    throw error;
  }
};

export function createMediaLoadService(options: MediaLoadServiceOptions = {}): {
  service: Service;
  runtime: MediaLoadRuntime;
  stop: () => Promise<void>;
} {
  const config = new MediaLoadConfigService(options.defaultDownloadPath);
  // Follows the values being applied: the configuration commits them only after `activate`, and
  // the engine that starts there must already see the right VPN setting.
  let vpnSettings = vpnSettingsFrom('MEDIA_LOAD', key => config.value(key));
  const vpn = new VpnGuard({
    settings: () => vpnSettings,
    fetchJson: options.vpnFetchJson,
  });
  // The engine itself is fenced while the connection is unprotected (no peers, announces or new
  // torrents), so every path that would reach the swarm is covered, including startup restores.
  const runtime = new MediaLoadRuntime(
    MediaLoadRuntime.databasePathFor(options.dataDir ?? './data'),
    options.legacyDownloadPath,
    () => vpn.state !== 'unprotected'
  );
  /** Checks the connection (cached) and applies the result to the engine's fence. */
  const checkVpn = async (signal?: AbortSignal): Promise<boolean> => {
    const isProtected = await vpn.isProtected(signal);
    await runtime.refreshNetwork();
    return isProtected;
  };
  let scrapes: { trackers: string; batcher: ScrapeBatcher } | null = null;
  /** Fails fast with `vpn_required` before anything that reaches trackers or peers. */
  const peerCall = async <T, E extends string>(
    ctx: CallContext<E | 'vpn_required'>,
    run: () => Promise<T> | T
  ): Promise<T> => {
    if (!(await checkVpn(ctx.signal)))
      return ctx.fail('vpn_required', 'Media load requires a protected connection');
    return run();
  };
  const peerEngineCall = <T, E extends string>(
    ctx: CallContext<E | 'vpn_required'>,
    run: () => Promise<T> | T
  ): Promise<T> => peerCall(ctx, () => engineCall(ctx, run));

  /** The batcher for the applied trackers; a tracker change starts a new one. */
  const batcher = (): ScrapeBatcher => {
    const trackers = config.list('SCRAPE_TRACKERS');
    const key = trackers.join(',');
    if (scrapes?.trackers !== key) {
      scrapes?.batcher.close();
      scrapes = { trackers: key, batcher: new ScrapeBatcher(trackers, options.scrape) };
    }
    return scrapes.batcher;
  };

  /** How many usable scrape trackers `values` name; an explicitly empty value means none. */
  const trackerSummary = (values: Record<string, string>): string => {
    const usable = (values.SCRAPE_TRACKERS ?? config.value('SCRAPE_TRACKERS'))
      .split(',')
      .map(item => item.trim())
      .filter(url => /^(udp|https?):\/\//.test(url));
    return usable.length
      ? `${usable.length} scrape tracker(s)`
      : 'No UDP or HTTP scrape trackers: swarm stats are unavailable';
  };

  config.registerProber({
    // No network check: a tracker being down is normal, and the others still answer.
    test: async values => {
      try {
        runtime.check({ ...config.defaults(), ...values });
      } catch (error) {
        if (error instanceof InvalidSettingsError)
          return { success: false, message: error.message };
        throw error;
      }
      return { success: true, message: trackerSummary(values) };
    },
    activate: async values => {
      const previousVpnSettings = vpnSettings;
      try {
        const applied = { ...config.defaults(), ...values };
        vpnSettings = vpnSettingsFrom('MEDIA_LOAD', key => applied[key]);
        const { restartKeys } = await runtime.activate(applied);
        void checkVpn().catch(() => undefined);
        return {
          success: true,
          message: restartKeys.length
            ? `${trackerSummary(values)}; restart the service to apply ${restartKeys.join(', ')}`
            : trackerSummary(values),
        };
      } catch (error) {
        vpnSettings = previousVpnSettings;
        return { success: false, message: error instanceof Error ? error.message : String(error) };
      }
    },
  });

  const engine = () => runtime.running;

  const service = defineService({
    // Shared secret every connection must present (SERVICE_TOKEN, unset: no check)
    token: process.env.SERVICE_TOKEN || undefined,
    info: {
      id: 'media-load',
      name: 'Media load',
      description: 'Torrent engine',
      version: '0.2.0',
    },
    configuration: config,
    ready: () => config.ready && runtime.serving,
    // `details.vpn` is this service's own connection; refreshed (cached) before reporting.
    status: async () => {
      await checkVpn().catch(() => false);
      return {
        // `configuring`, not `standby`: the host must not deliver the configuration again.
        state:
          config.ready && runtime.started ? (runtime.serving ? 'ready' : 'configuring') : 'standby',
        missingConfiguration: config.missingVars(),
        ...(runtime.keyMissing
          ? { message: 'Waiting for the host to send the security key' }
          : runtime.started && !runtime.serving
            ? { message: 'Waiting for the host to import its storage' }
            : {}),
        details: {
          vpn: vpn.state,
          engine: runtime.started ? engine().downloads.getStatus().status : 'stopped',
          torrents: runtime.started ? engine().downloads.client.torrents.length : 0,
          scrapes: scrapes?.batcher.stats ?? null,
        },
      };
    },
    onStop: async () => {
      stopVpnWatch();
      scrapes?.batcher.close();
      scrapes = null;
      await runtime.stop();
    },
  }).implement(mediaLoad, {
    attach: ({ securityKey }, ctx) => {
      try {
        runtime.attach(securityKey);
      } catch (error) {
        return ctx.fail('bad_request', error instanceof Error ? error.message : String(error));
      }
    },

    swarmStats: async ({ hash }, ctx) => {
      if (typeof hash !== 'string') return ctx.fail('invalid_hash', 'hash must be a string');
      return peerCall(ctx, async () => {
        try {
          return await batcher().scrape(hash);
        } catch (error) {
          if (error instanceof ScrapeError) return ctx.fail(error.code, error.message);
          throw error;
        }
      });
    },

    putSource: ({ source }) => runtime.putSource(source),
    sourceMetadataFile: ({ link, hash, timeoutMs }, ctx) =>
      peerEngineCall(ctx, async () => ({
        file: (await engine().downloads.getSourceMetadataFile(link, hash, timeoutMs)).toString(
          'base64'
        ),
      })),

    predownload: ({ target, claim }, ctx) =>
      peerEngineCall(ctx, async () =>
        engine().downloads.predownload(await runtime.target(target), claim)
      ),
    isFileComplete: ({ sourceId, filePath }) =>
      engine().downloads.isFileComplete(sourceId, filePath),
    resolveLayout: ({ sourceId }, ctx) => engineCall(ctx, () => runtime.resolveLayout(sourceId)),
    mediaFiles: ({ target }, ctx) =>
      engineCall(ctx, async () => engine().downloads.getMediaFiles(await runtime.target(target))),
    prepareSubtitleFiles: ({ target, paths }, ctx) =>
      engineCall(ctx, async () =>
        engine().downloads.prepareSubtitleFiles(await runtime.target(target), paths)
      ),
    playbackHealth: ({ sourceId, filePath }) =>
      engine().downloads.getPlaybackHealth(sourceId, filePath),
    releaseClaims: ({ sourceId, ownerKey, kind }) =>
      engine().downloads.releaseClaims(sourceId, ownerKey, kind),

    warmSource: ({ target, targetBytes, leaseKey, startFraction }, ctx) =>
      peerEngineCall(ctx, async () =>
        engine().downloads.warmSource(
          await runtime.target(target),
          targetBytes,
          leaseKey,
          startFraction
        )
      ),
    pauseSource: ({ sourceId }) => engine().downloads.pauseSource(sourceId),
    promoteSource: ({ target, ownerKey }, ctx) =>
      peerEngineCall(ctx, async () =>
        engine().downloads.promoteSource(await runtime.target(target), ownerKey)
      ),
    isRangeVerified: ({ sourceId, filePath, firstPiece, lastPiece }) =>
      engine().downloads.isRangeVerified(sourceId, filePath, firstPiece, lastPiece),
    rangeProgress: ({ sourceId, filePath, firstPiece, lastPiece }) =>
      engine().downloads.getRangeProgress(sourceId, filePath, firstPiece, lastPiece),

    playbackActivity: () => ({ activeSourceIds: engine().downloads.activePlaybackSourceIds() }),
    playbackChanged: emit =>
      engine().downloads.onPlaybackChange(activeSourceIds => emit({ activeSourceIds })),
    layoutKnown: emit =>
      engine().storage.onLayout((sourceId, layout) => emit({ sourceId, layout })),

    storageStates: ({ sourceIds }) => runtime.storageStates(sourceIds),
    storageInventory: () => runtime.inventory(),
    removeStorage: ({ sourceId }) => engine().storage.removeStorageWithResult(sourceId),
    storageBitfields: ({ sourceIds }) => runtime.storageBitfields(sourceIds),
    piecesChanged: (emit, filter) => runtime.onPieces(emit, filter?.sourceIds),
    transferHistory: ({ sourceId, since }) =>
      engine().database.getTransferRepository().history(sourceId, since),

    importStatus: () => runtime.importStatus(),
    importStorage: ({ items }, ctx) => engineCall(ctx, () => runtime.importStorage(items)),
    completeImport: () => runtime.completeImport(),

    read: ({ target, speculative }, ctx) =>
      engineCall(ctx, async () =>
        engine().downloads.streamFile(
          await runtime.target(target),
          ctx.headers.get('range') ?? undefined,
          Boolean(speculative)
        )
      ),
  });
  const stopVpnWatch = vpn.watch(() => {
    void runtime.refreshNetwork();
    service.notifyStatus();
  });
  // Readiness also depends on the engine, which starts after the configuration is applied, and
  // on the storage import (listeners hear both).
  runtime.onStart(() => {
    // The engine starts fenced until the first check says otherwise.
    void checkVpn().catch(() => undefined);
    service.notifyStatus();
  });
  return { service, runtime, stop: () => service.stop() };
}
