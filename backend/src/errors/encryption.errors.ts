import { AppError } from './base.error';

type EncryptionErrorCode =
  | 'decrypt_failed'
  | 'encrypt_failed'
  | 'invalid_data_length'
  | 'invalid_key_encoding'
  | 'invalid_key_format'
  | 'invalid_key_length'
  | 'key_required';

export class EncryptionError extends AppError {
  constructor(message: string, code: EncryptionErrorCode) {
    super(message, 'encryption', code);
  }
}
