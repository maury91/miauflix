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

export class VpnDetectionService {
  private readonly knownVpnIps: string[] = [];

  private async getIpAddress(): Promise<string> {
    const response = await fetch("https://api.ipify.org?format=json");
    const data = (await response.json()) as { ip: string };
    return data.ip;
  }

  private async isNordVpn(): Promise<boolean> {
    const response = await fetch(
      "https://api.nordvpn.com/v1/helpers/ips/insights",
    );
    const data = (await response.json()) as NordVpnIpInsightsResponse;
    if (data.protected) {
      return true;
    }
    return false;
  }

  private async isVpnIp(ipAddress: string): Promise<boolean> {
    if (this.knownVpnIps.includes(ipAddress)) {
      return true;
    }
    if (await this.isNordVpn()) {
      this.knownVpnIps.push(ipAddress);
      return true;
    }
    return false;
  }

  public async isVpnActive(): Promise<boolean> {
    const ipAddress = await this.getIpAddress();
    return this.isVpnIp(ipAddress);
  }
}
