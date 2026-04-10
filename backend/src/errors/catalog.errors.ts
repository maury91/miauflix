import { AppError } from './base.error';

type CatalogErrorCode = 'user_not_found';

export class CatalogError extends AppError {
  constructor(message: string, code: CatalogErrorCode) {
    super(message, 'catalog', code);
  }
}
