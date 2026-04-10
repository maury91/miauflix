export class AppError extends Error {
  constructor(
    message: string,
    public readonly type: string,
    public readonly code: string
  ) {
    super(message);
    this.name = `${type}/${code}`;
  }
}
