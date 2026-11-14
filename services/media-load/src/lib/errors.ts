import type {
  MediaLoadError,
  RemuxReadError,
  StorageImportError,
} from '@miauflix/service-contracts';

/**
 * An engine failure with a machine-readable code, as the backend's `ErrorWithStatus`. The
 * contract handlers turn it into a contract error with the same code.
 */
export class ErrorWithStatus extends Error {
  constructor(
    message: string,
    public status: MediaLoadError | RemuxReadError | StorageImportError
  ) {
    super(message);
    this.name = 'ErrorWithStatus';
  }
}
