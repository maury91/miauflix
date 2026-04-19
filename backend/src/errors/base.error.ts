export class AppError<C extends string = string> extends Error {
  constructor(
    message: string,
    public readonly type: string,
    public readonly code: C
  ) {
    super(message);
    this.name = `${type}/${code}`;
  }
}
