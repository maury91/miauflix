import type { ConfigVariable } from '@miauflix/contract';

/**
 * What a service reports in its status (`details.vpn`): `disabled` when its check is turned off,
 * otherwise the result of the last check.
 */
export type VpnState = 'disabled' | 'protected' | 'unprotected';

export interface VpnGuardSettings {
  /** The check is turned off: the connection counts as protected. */
  disabled: boolean;
  /** Comma-separated public IPs that count as protected (a VPN NordVPN does not recognise). */
  knownVpnIps: string;
}

export interface VpnGuardOptions {
  /** Read on every check, so configuration changes apply without a new guard. */
  settings: () => VpnGuardSettings;
  /** Fetches and parses JSON. Defaults to `fetch`; services pass their own HTTP client. */
  fetchJson?: (url: string, init: { signal?: AbortSignal }) => Promise<unknown>;
  now?: () => number;
}

export const NORDVPN_INSIGHTS_URL = 'https://api.nordvpn.com/v1/helpers/ips/insights';

/** A protected result is trusted for five minutes; a failure is retried after 30 seconds. */
const PROTECTED_TTL_MS = 300_000;
const UNPROTECTED_TTL_MS = 30_000;

const defaultFetchJson = async (url: string, init: { signal?: AbortSignal }): Promise<unknown> => {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
};

/**
 * Whether this process's outbound connection goes through a VPN, asked to NordVPN's IP insights.
 * Every service that reaches indexers, trackers or peers runs its own guard, so the check follows
 * the network the service actually uses, wherever it is deployed.
 *
 * Fails closed: an error counts as unprotected, but a caller's cancellation is not cached.
 */
export class VpnGuard {
  private cached = { value: false, until: 0, knownVpnIps: '' };
  private checked = false;
  private readonly fetchJson: NonNullable<VpnGuardOptions['fetchJson']>;
  private readonly now: () => number;

  constructor(private readonly options: VpnGuardOptions) {
    this.fetchJson = options.fetchJson ?? defaultFetchJson;
    this.now = options.now ?? Date.now;
  }

  /** The last known state; `unprotected` until the first check completes. */
  get state(): VpnState {
    if (this.options.settings().disabled) return 'disabled';
    return this.checked && this.cached.value ? 'protected' : 'unprotected';
  }

  async isProtected(signal?: AbortSignal, settings?: VpnGuardSettings): Promise<boolean> {
    const { disabled, knownVpnIps } = settings ?? this.options.settings();
    if (disabled) return true;
    if (this.cached.until > this.now() && this.cached.knownVpnIps === knownVpnIps)
      return this.cached.value;
    let protectedConnection = false;
    try {
      const data = (await this.fetchJson(NORDVPN_INSIGHTS_URL, { signal })) as {
        protected?: boolean;
        ip?: string;
      };
      protectedConnection =
        data.protected === true ||
        knownVpnIps
          .split(',')
          .map(ip => ip.trim())
          .filter(Boolean)
          .includes(data.ip ?? '');
    } catch {
      signal?.throwIfAborted();
      // Fail closed for actual check failures, never for the caller's cancellation.
    }
    // A check made with draft settings (a configuration test) must not decide the live state.
    if (settings) return protectedConnection;
    this.cached = {
      value: protectedConnection,
      until: this.now() + (protectedConnection ? PROTECTED_TTL_MS : UNPROTECTED_TTL_MS),
      knownVpnIps,
    };
    this.checked = true;
    return protectedConnection;
  }

  /**
   * Checks every `intervalMs`, calling `onChange` whenever `state` changes, so a service can push
   * its status. The first check waits for the first interval: a service checks on its own when it
   * first reports. Returns a function that stops watching.
   */
  watch(onChange: (state: VpnState) => void, intervalMs = 30_000): () => void {
    let last = this.state;
    const check = () =>
      this.isProtected()
        .catch(() => false)
        .then(() => {
          const next = this.state;
          if (next !== last) {
            last = next;
            onChange(next);
          }
        });
    const timer = setInterval(() => void check(), intervalMs);
    (timer as { unref?: () => void }).unref?.();
    return () => clearInterval(timer);
  }
}

/** The settings of a service's guard, `<PREFIX>_DISABLE_VPN_CHECK` and `<PREFIX>_KNOWN_VPN_IPS`. */
export const vpnConfigVariables = (prefix: string): ConfigVariable[] => [
  {
    key: `${prefix}_DISABLE_VPN_CHECK`,
    description: 'Allow running without a VPN: peers and sites see your real IP',
    defaultValue: 'false',
    required: false,
    inputType: 'boolean',
    booleanStateDescriptions: {
      true: 'VPN check disabled',
      false: 'Requires a VPN-protected connection',
    },
  },
  {
    key: `${prefix}_KNOWN_VPN_IPS`,
    description: 'Comma-separated public IPs that count as VPN-protected',
    defaultValue: '',
    required: false,
    advanced: true,
    inputType: 'text',
  },
];

/** Reads a guard's settings from a service's configuration values. */
export const vpnSettingsFrom = (
  prefix: string,
  value: (key: string) => string | undefined
): VpnGuardSettings => ({
  disabled: value(`${prefix}_DISABLE_VPN_CHECK`) === 'true',
  knownVpnIps: value(`${prefix}_KNOWN_VPN_IPS`) ?? '',
});
