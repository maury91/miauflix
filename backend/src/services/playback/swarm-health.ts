/** One observation of a source's torrent while a viewer waits on it. */
export interface SwarmSample {
  at: number;
  peers: number;
  downloadSpeed: number;
}

/**
 * `healthy`: delivering what the video needs. `weak`: not yet, but still discovering peers or
 * visibly improving, so a backup should get ready. `failed`: not enough and not improving.
 */
export type SwarmVerdict = 'failed' | 'healthy' | 'weak';

/** New torrents take seconds to find peers; starvation this short is never judged a failure. */
export const SWARM_GRACE_MS = 10_000;
/** Starved this long, a source loses to an alternative even while it improves. */
export const SWARM_HARD_CAP_MS = 25_000;
/** Improvement is measured against the oldest sample this recent. */
export const SWARM_TREND_WINDOW_MS = 8_000;
/** Delivery must beat the video bitrate by this much to be enough on its own. */
const ENOUGH_FACTOR = 1.2;
/** With a backup torrent sharing the bandwidth, the primary is held to a lower bar. */
const ENOUGH_FACTOR_WHILE_HEDGING = 0.6;
/** Speed gains smaller than this are noise, not improvement. */
const MIN_SPEED_GAIN = 16 * 1024;

export function assessSwarm({
  samples,
  starvedForMs,
  requiredBytesPerSecond,
  hedging,
}: {
  samples: readonly SwarmSample[];
  starvedForMs: number;
  requiredBytesPerSecond: number;
  hedging: boolean;
}): SwarmVerdict {
  const latest = samples.at(-1);
  if (!latest) return 'weak';
  if (starvedForMs >= SWARM_HARD_CAP_MS) return 'failed';
  const factor = hedging ? ENOUGH_FACTOR_WHILE_HEDGING : ENOUGH_FACTOR;
  if (latest.downloadSpeed >= requiredBytesPerSecond * factor) return 'healthy';
  if (starvedForMs < SWARM_GRACE_MS) return 'weak';
  const base = samples.find(sample => sample.at >= latest.at - SWARM_TREND_WINDOW_MS) ?? latest;
  const improving =
    latest.peers > base.peers || latest.downloadSpeed > base.downloadSpeed * 1.25 + MIN_SPEED_GAIN;
  return improving ? 'weak' : 'failed';
}
