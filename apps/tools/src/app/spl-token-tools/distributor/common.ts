export class SolaceError extends Error {
  error: string;
  message: string;
  statusCode: number;

  constructor({
    error,
    message,
    statusCode,
  }: {
    error: string;
    message: string;
    statusCode: number;
  }) {
    super(message);
    this.error = error;
    this.message = message;
    this.statusCode = statusCode;
    this.name = "SolaceError";
    Object.setPrototypeOf(this, SolaceError.prototype);
  }
}
