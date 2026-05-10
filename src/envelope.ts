import { AkashikError } from "./errors.js";
import { generateId } from "./id.js";

export type MessageType =
  | "REGISTER"
  | "DEREGISTER"
  | "RECORD"
  | "DRAFT"
  | "COMMIT"
  | "DISCARD"
  | "RETRACT"
  | "SUPERSEDE"
  | "ATTUNE"
  | "RECKON";

export type Message = {
  id: string;
  type: MessageType;
  sender: string;
  epoch: number;
  timestamp: number;
  payload: Record<string, unknown>;
  correlation_id?: string;
};

const PROTOCOL_VERSION = "0.2";

const VALID_MESSAGE_TYPES = new Set<MessageType>([
  "REGISTER",
  "DEREGISTER",
  "RECORD",
  "DRAFT",
  "COMMIT",
  "DISCARD",
  "RETRACT",
  "SUPERSEDE",
  "ATTUNE",
  "RECKON",
]);

/**
 * Construct a Message envelope wrapping a payload.
 * Used internally by every protocol operation before processing.
 */
export function wrap(input: {
  type: MessageType;
  sender: string;
  epoch: number;
  payload: Record<string, unknown>;
  correlation_id?: string;
}): Message {
  return {
    id: generateId(),
    type: input.type,
    sender: input.sender,
    epoch: input.epoch,
    timestamp: Date.now(),
    payload: input.payload,
    ...(input.correlation_id !== undefined && {
      correlation_id: input.correlation_id,
    }),
  };
}

/**
 * Validate and parse a Message envelope.
 * Throws AkashikError with code "INVALID_ENVELOPE" if the message
 * doesn't conform to the expected shape.
 */
export function unwrap(message: unknown): Message {
  if (!isPlainObject(message)) {
    throw new AkashikError("INVALID_ENVELOPE", "envelope must be a plain object", {
      received: typeof message,
    });
  }

  const m = message as Record<string, unknown>;

  if (typeof m.id !== "string" || m.id.length === 0) {
    throw new AkashikError("INVALID_ENVELOPE", "envelope.id must be a non-empty string");
  }
  if (typeof m.type !== "string" || !VALID_MESSAGE_TYPES.has(m.type as MessageType)) {
    throw new AkashikError("INVALID_ENVELOPE", "envelope.type must be a recognised MessageType", {
      received: m.type,
    });
  }
  if (typeof m.sender !== "string") {
    throw new AkashikError("INVALID_ENVELOPE", "envelope.sender must be a string");
  }
  if (typeof m.epoch !== "number" || !Number.isInteger(m.epoch) || m.epoch < 0) {
    throw new AkashikError("INVALID_ENVELOPE", "envelope.epoch must be a non-negative integer");
  }
  if (typeof m.timestamp !== "number" || m.timestamp <= 0) {
    throw new AkashikError("INVALID_ENVELOPE", "envelope.timestamp must be a positive number");
  }
  if (!isPlainObject(m.payload)) {
    throw new AkashikError("INVALID_ENVELOPE", "envelope.payload must be a plain object");
  }
  if (m.correlation_id !== undefined && typeof m.correlation_id !== "string") {
    throw new AkashikError(
      "INVALID_ENVELOPE",
      "envelope.correlation_id, if present, must be a string",
    );
  }

  return m as unknown as Message;
}

/**
 * The protocol version this implementation conforms to.
 * Used at REGISTER time (Story 2) for negotiation.
 */
export function protocolVersion(): string {
  return PROTOCOL_VERSION;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}
