import { FindOperator, type ValueTransformer } from 'typeorm';

import type { EncryptionService } from '@services/encryption/encryption.service';

/**
 * Text columns that would reveal what is stored or watched (file paths, probe output, searches,
 * notification titles) are encrypted at rest and use short column names that don't describe
 * them. Deterministic columns encrypt equal values to equal ciphertexts, so equality lookups,
 * `In()` and unique constraints keep working; use them only where the column is looked up.
 */
export class EncryptedColumns {
  private static service: EncryptionService | undefined;

  static configure(service: EncryptionService): void {
    EncryptedColumns.service = service;
  }

  private static get encryption(): EncryptionService {
    if (!EncryptedColumns.service) throw new Error('Encrypted columns are not configured');
    return EncryptedColumns.service;
  }

  /**
   * The stored form of a value, for raw SQL and query-builder parameters, which TypeORM passes
   * through without the column transformer.
   */
  static encrypt(value: string, deterministic: boolean): string {
    return EncryptedColumns.encryption.encryptString(value, deterministic, false);
  }

  static decrypt(value: string): string {
    return EncryptedColumns.encryption.decryptString(value, false);
  }

  /** Whether a stored value is already encrypted (AES-GCM rejects anything else). */
  static isEncrypted(value: string): boolean {
    try {
      EncryptedColumns.encryption.decryptString(value, false, false);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Encrypt a value or a find operator's operands. `find()` hands the transformer each operand,
 * but `update()` and `delete()` conditions hand it the operator (`In([...])`) itself.
 */
function encryptOperand(value: unknown, deterministic: boolean): unknown {
  if (value instanceof FindOperator) {
    const operator = value as FindOperator<unknown>;
    return new FindOperator(
      operator.type,
      encryptOperand(operator.child ?? operator.value, deterministic),
      operator.useParameter,
      operator.multipleParameters,
      operator.getSql,
      operator.objectLiteralParameters
    );
  }
  if (Array.isArray(value)) return value.map(item => encryptOperand(item, deterministic));
  return typeof value === 'string' ? EncryptedColumns.encrypt(value, deterministic) : value;
}

/** Column transformer for an encrypted text column; null and undefined are stored as NULL. */
export function encryptedText({ deterministic }: { deterministic: boolean }): ValueTransformer {
  return {
    to: (value: unknown) => encryptOperand(value, deterministic),
    from: (value: string | null | undefined) =>
      value === null || value === undefined ? null : EncryptedColumns.decrypt(value),
  };
}
