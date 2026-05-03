export type AkashikErrorCode =
  | "INTENT_REQUIRED"
  | "INTENT_TOO_SHORT"
  | "INVALID_ENTRY"
  | "INVALID_QUERY" // implemented in Story 2
  | "AGENT_REQUIRED"; // implemented in Story 3

export class AkashikError extends Error {
  readonly code: AkashikErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: AkashikErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "AkashikError";
    this.code = code;
    this.details = details;
    // Restore prototype chain — required for instanceof to work after transpilation
    Object.setPrototypeOf(this, AkashikError.prototype);
  }
}
