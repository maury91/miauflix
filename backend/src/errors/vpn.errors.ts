import { AppError } from '@errors/base.error';

type VpnErrorCode = 'all_providers_failed' | 'http_error' | 'invalid_ip';

export class VpnError extends AppError {
  constructor(message: string, code: VpnErrorCode) {
    super(message, 'vpn', code);
  }
}
