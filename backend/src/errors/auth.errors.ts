export class LoginError extends Error {
  constructor(public email: string) {
    super("Invalid credentials");
  }
}
