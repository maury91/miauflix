export class ErrorWithStatus extends Error {
  constructor(
    message: string,
    public status: string
  ) {
    super(message);
    this.name = 'ErrorWithStatus';
  }
}
