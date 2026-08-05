import { ulid } from "ulid";
import type { FieldEntryStatus } from "./types.js";

/**
 * Version of the persisted event format. Independent of SDK version and
 * protocol version. Increment ONLY when the shape of a persisted event
 * changes in a way a reader of the previous version could not handle.
 *
 * v1 — initial durable format, v0.3.0.
 */
export const EVENT_FORMAT_VERSION = 1;

/**
 * A single event in the append-only log. Every durable state change is
 * represented as one or more FieldEvents appended atomically.
 *
 * Note: these are STORAGE events, not protocol operations. A retract and a
 * supersede both produce STATUS_CHANGE events; supersede additionally produces
 * a RECORD. Protocol operation names live on the envelope, not here.
 */
export type FieldEvent = RecordEvent | StatusChangeEvent | RegisterEvent | DeregisterEvent;

type BaseEvent = {
  /** Event format version. Always EVENT_FORMAT_VERSION at construction. */
  v: number;
  /** Unique event id (ULID). Assigned at construction. Tertiary sort key. */
  event_id: string;
  /** Logical clock value. Set by the field. Primary sort key. */
  lamport: number;
  /** The responsible agent, or null for agentless writes. Secondary sort key. */
  agent: string | null;
  /**
   * Wall-clock time in Unix ms. METADATA ONLY. Never an ordering key.
   * Wall clocks drift between machines; using this to sort would reintroduce
   * the distributed-clock problem Lamport clocks exist to solve.
   */
  wall_time: number;
  /** Sequence position, assigned by the adapter on append. -1 until appended. */
  seq: number;
};

/** A new entry is recorded. From write, commit, or supersede's new half. */
export type RecordEvent = BaseEvent & {
  type: "RECORD";
  entry_id: string;
  entry: Record<string, unknown>;
  intent: string;
  /** Optional confidence. Shape defined here; populated from Story 4. */
  confidence?: { score: number; reason?: string };
  /** For supersede's new half: the entry id being superseded. */
  supersedes?: string;
};

/** An entry's status changes. From retract, discard, or supersede's old half. */
export type StatusChangeEvent = BaseEvent & {
  type: "STATUS_CHANGE";
  entry_id: string;
  new_status: FieldEntryStatus;
  intent: string;
};

/** An agent registers a session. */
export type RegisterEvent = BaseEvent & {
  type: "REGISTER";
  entry_id: string; // the session / agent id
  role: string;
  capabilities: string[];
};

/** An agent deregisters. */
export type DeregisterEvent = BaseEvent & {
  type: "DEREGISTER";
  entry_id: string; // the session / agent id
};

/** Construct a RECORD event. Pure; caller input cannot override generated fields. */
export function recordEvent(input: {
  lamport: number;
  agent: string | null;
  entry_id: string;
  entry: Record<string, unknown>;
  intent: string;
  confidence?: { score: number; reason?: string };
  supersedes?: string;
}): RecordEvent {
  return {
    ...input,
    type: "RECORD",
    v: EVENT_FORMAT_VERSION,
    event_id: ulid(),
    seq: -1,
    wall_time: Date.now(),
  };
}

/** Construct a STATUS_CHANGE event. Pure; caller input cannot override generated fields. */
export function statusChangeEvent(input: {
  lamport: number;
  agent: string | null;
  entry_id: string;
  new_status: FieldEntryStatus;
  intent: string;
}): StatusChangeEvent {
  return {
    ...input,
    type: "STATUS_CHANGE",
    v: EVENT_FORMAT_VERSION,
    event_id: ulid(),
    seq: -1,
    wall_time: Date.now(),
  };
}

/** Construct a REGISTER event. Pure; caller input cannot override generated fields. */
export function registerEvent(input: {
  lamport: number;
  agent: string | null;
  entry_id: string;
  role: string;
  capabilities: string[];
}): RegisterEvent {
  return {
    ...input,
    type: "REGISTER",
    v: EVENT_FORMAT_VERSION,
    event_id: ulid(),
    seq: -1,
    wall_time: Date.now(),
  };
}

/** Construct a DEREGISTER event. Pure; caller input cannot override generated fields. */
export function deregisterEvent(input: {
  lamport: number;
  agent: string | null;
  entry_id: string;
}): DeregisterEvent {
  return {
    ...input,
    type: "DEREGISTER",
    v: EVENT_FORMAT_VERSION,
    event_id: ulid(),
    seq: -1,
    wall_time: Date.now(),
  };
}
