import { logger } from '@logger';
import type { ServiceStatus } from '@miauflix/contract';

import type { ConfigService, ServiceInstanceStatus } from '@mytypes/configuration';

type VpnEventType = 'connect' | 'disconnect';
type VpnEventListener = () => void;

/** The service that runs on the VPN-protected network and reports its state in `details.vpn`. */
export interface VpnStatusSource {
  remoteStatus(): Promise<ServiceStatus>;
}

/**
 * VPN state of the network that reaches indexers, trackers and peers. That network belongs to the
 * video services (sources and media-load), not to the backend, so the state is the one the sources
 * service reports: `protected`, `unprotected` or `disabled` (its own check is turned off).
 * Fails closed: an unreachable sources service counts as unprotected.
 */
export class VpnDetectionService {
  private eventListeners: Map<VpnEventType, VpnEventListener[]> = new Map([
    ['connect', []],
    ['disconnect', []],
  ]);
  private disabled: boolean;
  private monitoringInterval: ReturnType<typeof setInterval> | null = null;
  private readonly config: ConfigService;
  private lastVpnStatus: boolean | null = null;

  constructor(
    config: ConfigService,
    private readonly source: VpnStatusSource,
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

  testable = false;
  getStatus(): ServiceInstanceStatus {
    return { status: 'ready' };
  }

  async reload(): Promise<void> {
    const newDisabled = this.config.getOrThrow('DISABLE_VPN_CHECK');
    if (newDisabled === this.disabled) return;
    this.disabled = newDisabled;
    if (this.disabled) {
      this.stop();
      this.lastVpnStatus = true;
    } else {
      this.lastVpnStatus = null;
      this.startMonitoring();
    }
  }

  public async isVpnActive(): Promise<boolean> {
    try {
      const status = await this.source.remoteStatus();
      const vpn = status.details?.vpn;
      return vpn === 'protected' || vpn === 'disabled';
    } catch (error) {
      logger.debug('VPN', 'Sources service did not report its VPN state', error);
      return false;
    }
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

  public stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  private notifyEventListeners(event: VpnEventType): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(listener => listener());
    }
  }

  private async checkVpnStatus(): Promise<void> {
    const currentStatus = await this.isVpnActive();
    if (this.disabled) return;

    if (currentStatus !== this.lastVpnStatus) {
      this.lastVpnStatus = currentStatus;
      this.notifyEventListeners(currentStatus ? 'connect' : 'disconnect');
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
