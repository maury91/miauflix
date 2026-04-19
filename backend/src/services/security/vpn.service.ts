import { logger } from '@logger';

import { VpnError } from '@errors/vpn.errors';
import type { ConfigService, ServiceInstanceStatus } from '@mytypes/configuration';

interface NordVpnIpInsightsResponse {
  ip: string;
  country: string;
  country_code: string;
  city: string;
  isp: string;
  isp_asn: string;
  protected: boolean;
  longitude: number;
  latitude: number;
  state_code: string;
  zip_code: string;
}

interface IpProvider {
  name: string;
  url: string;
  timeout: number;
  extractIp: (response: Record<string, unknown>) => string;
}

type VpnEventType = 'connect' | 'disconnect';
type VpnEventListener = () => void;

export class VpnDetectionService {
  getStatus(): ServiceInstanceStatus {
    return { status: 'ready' };
  }
  private readonly knownVpnIps: string[] = [];
  private eventListeners: Map<VpnEventType, VpnEventListener[]> = new Map([
    ['connect', []],
    ['disconnect', []],
  ]);
  private disabled: boolean;
  private monitoringInterval: ReturnType<typeof setInterval> | null = null;
  private readonly config: ConfigService;
  private lastVpnStatus: boolean | null = null;
  protected currentProviderIndex: number = 0;

  protected readonly ipProviders: IpProvider[] = [
    {
      name: 'ipify',
      url: 'https://api.ipify.org?format=json',
      timeout: 5000,
      extractIp: data => String(data.ip || ''),
    },
    {
      name: 'ipinfo.io',
      url: 'https://ipinfo.io/json',
      timeout: 5000,
      extractIp: data => String(data.ip || ''),
    },
    {
      name: 'ident.me',
      url: 'https://v4.ident.me/.json',
      timeout: 5000,
      extractIp: data => String(data.address || ''),
    },
    {
      name: 'httpbin',
      url: 'https://httpbin.org/ip',
      timeout: 5000,
      extractIp: data => String(data.origin || ''),
    },
    {
      name: 'ip-api.com',
      url: 'http://ip-api.com/json/?fields=query',
      timeout: 5000,
      extractIp: data => String(data.query || ''),
    },
    {
      name: 'ifconfig.me',
      url: 'https://ifconfig.me/all.json',
      timeout: 5000,
      extractIp: data => String(data.ip_addr || ''),
    },
  ];

  constructor(
    config: ConfigService,
    private readonly checkIntervalMs: number = 5000
  ) {
    this.config = config;
    this.disabled = config.getOrThrow('DISABLE_VPN_CHECK');
    if (this.disabled) {
      this.lastVpnStatus = true;
    } else {
      this.startMonitoring();
    }
    config.registerService('VPN', this);
  }

  async reload(): Promise<void> {
    const newDisabled = this.config.getOrThrow('DISABLE_VPN_CHECK');
    if (newDisabled === this.disabled) return;
    this.disabled = newDisabled;
    if (this.disabled) {
      if (this.monitoringInterval) {
        clearInterval(this.monitoringInterval);
        this.monitoringInterval = null;
      }
      this.lastVpnStatus = true;
    } else {
      this.startMonitoring();
    }
  }

  protected async getIpAddress(): Promise<string> {
    const maxAttempts = this.ipProviders.length;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const provider = this.ipProviders[this.currentProviderIndex];

      try {
        logger.debug('VPN', `Attempting to get IP from ${provider.name} (${provider.url})`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), provider.timeout);

        const response = await fetch(provider.url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; VpnDetectionService/1.0)',
          },
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new VpnError(`HTTP ${response.status}: ${response.statusText}`, 'http_error');
        }

        const data = (await response.json()) as Record<string, unknown>;
        const ip = provider.extractIp(data);

        if (!ip || typeof ip !== 'string' || !this.isValidIp(ip)) {
          throw new VpnError(`Invalid IP address received: ${ip}`, 'invalid_ip');
        }

        logger.debug('VPN', `Successfully got IP ${ip} from ${provider.name}`);
        return ip;
      } catch (error) {
        lastError = error instanceof Error ? error : new VpnError(String(error), 'http_error');
        logger.warn('VPN', `Failed to get IP from ${provider.name}: ${lastError.message}`);

        // Move to next provider
        this.currentProviderIndex = (this.currentProviderIndex + 1) % this.ipProviders.length;
      }
    }

    throw new VpnError(
      `All IP providers failed. Last error: ${lastError?.message || 'Unknown error'}`,
      'all_providers_failed'
    );
  }

  private isValidIp(ip: string): boolean {
    // Basic IPv4 validation
    const ipv4Regex =
      /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    // Basic IPv6 validation
    const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$/;

    return ipv4Regex.test(ip) || ipv6Regex.test(ip);
  }

  private async isNordVpn(): Promise<string | false> {
    const response = await fetch('https://api.nordvpn.com/v1/helpers/ips/insights');
    const data = (await response.json()) as NordVpnIpInsightsResponse;
    if (data.protected) {
      return data.ip;
    }
    return false;
  }

  public async isVpnActive(): Promise<boolean> {
    if (this.knownVpnIps.length > 0) {
      const ipAddress = await this.getIpAddress();
      if (this.knownVpnIps.includes(ipAddress)) {
        return true;
      }
    }
    const isNordVpnIp = await this.isNordVpn();
    if (isNordVpnIp) {
      this.knownVpnIps.push(isNordVpnIp);
      return true;
    }
    return false;
  }

  public status() {
    return {
      isVpnActive: this.disabled ? null : this.lastVpnStatus,
      disabled: this.disabled,
    };
  }

  public on(event: VpnEventType, listener: VpnEventListener): () => void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.push(listener);
      if (event === 'connect' && this.lastVpnStatus === true) {
        listener();
      } else if (event === 'disconnect' && this.lastVpnStatus === false) {
        listener();
      }
    }

    // Return unsubscribe function
    return () => {
      const listeners = this.eventListeners.get(event);
      if (listeners) {
        const index = listeners.indexOf(listener);
        if (index > -1) {
          listeners.splice(index, 1);
        }
      }
    };
  }

  private notifyEventListeners(event: VpnEventType): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(listener => listener());
    }
  }

  private async checkVpnStatus(): Promise<void> {
    const currentStatus = await this.isVpnActive();

    if (currentStatus !== this.lastVpnStatus) {
      this.notifyEventListeners(currentStatus ? 'connect' : 'disconnect');
      this.lastVpnStatus = currentStatus;
    }
  }

  private startMonitoring(): void {
    if (this.monitoringInterval) {
      return;
    }

    this.monitoringInterval = setInterval(() => {
      this.checkVpnStatus().catch(error => {
        logger.error('VPN', 'Error checking VPN status:', error);
      });
    }, this.checkIntervalMs);
  }
}
