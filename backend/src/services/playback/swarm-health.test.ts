import { assessSwarm, SWARM_GRACE_MS, SWARM_HARD_CAP_MS } from './swarm-health';

const required = 500 * 1024;
const samples = (...points: Array<[peers: number, speed: number]>) =>
  points.map(([peers, downloadSpeed], index) => ({ at: index * 1_000, peers, downloadSpeed }));

describe('assessSwarm', () => {
  it('is healthy when delivery beats the bitrate, however the peer count moves', () => {
    expect(
      assessSwarm({
        samples: samples([8, 700 * 1024], [8, 700 * 1024]),
        starvedForMs: 15_000,
        requiredBytesPerSecond: required,
        hedging: false,
      })
    ).toBe('healthy');
  });

  it('only calls a slow source weak while it is still discovering peers', () => {
    expect(
      assessSwarm({
        samples: samples([0, 0], [0, 0]),
        starvedForMs: SWARM_GRACE_MS - 1,
        requiredBytesPerSecond: required,
        hedging: false,
      })
    ).toBe('weak');
  });

  it('keeps an improving source weak and fails one that is flat after the grace period', () => {
    const base = { starvedForMs: SWARM_GRACE_MS, requiredBytesPerSecond: required, hedging: false };
    expect(assessSwarm({ ...base, samples: samples([2, 50 * 1024], [4, 60 * 1024]) })).toBe('weak');
    expect(assessSwarm({ ...base, samples: samples([3, 40 * 1024], [3, 200 * 1024]) })).toBe(
      'weak'
    );
    expect(assessSwarm({ ...base, samples: samples([3, 60 * 1024], [3, 62 * 1024]) })).toBe(
      'failed'
    );
  });

  it('holds the primary to a lower bar once a backup shares the bandwidth', () => {
    const slow = { samples: samples([5, 400 * 1024]), starvedForMs: 12_000 };
    expect(assessSwarm({ ...slow, requiredBytesPerSecond: required, hedging: false })).toBe(
      'failed'
    );
    expect(assessSwarm({ ...slow, requiredBytesPerSecond: required, hedging: true })).toBe(
      'healthy'
    );
  });

  it('gives up on a source starved past the hard cap even while it improves', () => {
    expect(
      assessSwarm({
        samples: samples([1, 10 * 1024], [6, 300 * 1024]),
        starvedForMs: SWARM_HARD_CAP_MS,
        requiredBytesPerSecond: required,
        hedging: false,
      })
    ).toBe('failed');
  });
});
