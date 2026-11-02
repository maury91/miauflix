import type { SourcesConfigService } from '../config/config.service';
import type { HttpClient } from '../http/http-client';

/** Fail closed; cache failures briefly so an outage does not overload the VPN insight API. */
export class VpnGuard {
  private cached = { value: false, until: 0, settings: '' };
  constructor(
    private config: SourcesConfigService,
    private http: HttpClient,
    private now = Date.now
  ) {}
  get state(): 'disabled' | 'protected' | 'unprotected' {
    return this.config.value('SOURCES_DISABLE_VPN_CHECK') === 'true'
      ? 'disabled'
      : this.cached.value && this.cached.until > this.now()
        ? 'protected'
        : 'unprotected';
  }
  async isProtected(signal?: AbortSignal, values?: Record<string, string>): Promise<boolean> {
    const value = (key: string) => values?.[key] ?? this.config.value(key);
    if (value('SOURCES_DISABLE_VPN_CHECK') === 'true') return true;
    const settings = value('SOURCES_KNOWN_VPN_IPS');
    if (this.cached.until > this.now() && this.cached.settings === settings)
      return this.cached.value;
    let protectedConnection = false;
    try {
      const data = await this.http.json<{ protected?: boolean; ip?: string }>(
        'https://api.nordvpn.com/v1/helpers/ips/insights',
        { signal }
      );
      protectedConnection =
        data.protected === true ||
        settings
          .split(',')
          .map(v => v.trim())
          .filter(Boolean)
          .includes(data.ip ?? '');
    } catch {
      /* Fail closed. */
    }
    this.cached = {
      value: protectedConnection,
      until: this.now() + (protectedConnection ? 300_000 : 30_000),
      settings,
    };
    return protectedConnection;
  }
}
