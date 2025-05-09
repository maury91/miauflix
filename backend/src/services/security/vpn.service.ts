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

type VpnEventType = 'connect' | 'disconnect';
type VpnEventListener = () => void;

export class VpnDetectionService {
  private readonly knownVpnIps: string[] = [];
  private eventListeners: Map<VpnEventType, VpnEventListener[]> = new Map([
    ['connect', []],
    ['disconnect', []],
  ]);
  private monitoringInterval: ReturnType<typeof setInterval> | null = null;
  private lastVpnStatus: boolean | null = null;

  constructor(private readonly checkIntervalMs: number = 500) {
    this.startMonitoring();
  }

  private async getIpAddress(): Promise<string> {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = (await response.json()) as { ip: string };
    return data.ip;
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
      isVpnActive: this.lastVpnStatus,
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
        console.error('Error checking VPN status:', error);
      });
    }, this.checkIntervalMs);
  }
}
