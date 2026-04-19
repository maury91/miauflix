import { AppError } from '@errors/base.error';

type ConfigurationErrorCode =
  | 'invalid_config_file'
  | 'invalid_variable_value'
  | 'missing_required_variable'
  | 'service_not_found'
  | 'service_not_registered'
  | 'service_restart_required'
  | 'unknown_config_key';

export class ConfigurationServiceError extends AppError<ConfigurationErrorCode> {
  constructor(
    message: string,
    code: ConfigurationErrorCode,
    public readonly variable?: string
  ) {
    super(message, 'configuration', code);
  }
}
