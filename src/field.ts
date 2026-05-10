import { protocolVersion, unwrap, wrap } from "./envelope.js";
import { AkashikError } from "./errors.js";
import { generateId } from "./id.js";
import { computeRelevance } from "./relevance.js";
import type {
  AttuneContext,
  Field,
  FieldEntry,
  FieldEntryWithRelevance,
  FieldOptions,
  ReadQuery,
  RegisterInput,
  RegisterResult,
  Session,
  WriteInput,
  WriteResult,
} from "./types.js";

// ── constants ────────────────────────────────────────────────────────────────

const DEFAULT_MIN_INTENT_LENGTH = 10;

// ── public API ───────────────────────────────────────────────────────────────

export function createField(options: FieldOptions = {}): Field {
  const minIntentLength = options.minIntentLength ?? DEFAULT_MIN_INTENT_LENGTH;
  const entries: FieldEntry[] = [];
  let zeroLengthWarned = false;
  let epochCounter = 0;

  // Story 2: session tracking
  const sessions = new Map<string, Session>();

  // write — store an entry with mandatory intent
  async function write(input: WriteInput): Promise<WriteResult> {
    // 1. Validate entry is a plain object.
    if (!isPlainObject(input?.entry)) {
      throw new AkashikError("INVALID_ENTRY", "entry must be a plain object", {
        received: typeof input?.entry,
      });
    }

    // 2. Validate intent presence.
    if (input.intent === undefined || input.intent === null) {
      throw new AkashikError("INTENT_REQUIRED", "intent is required on every write");
    }
    if (typeof input.intent !== "string") {
      throw new AkashikError("INTENT_REQUIRED", "intent must be a string", {
        received: typeof input.intent,
      });
    }

    // 3. Validate intent length (after trim).
    const trimmedIntent = input.intent.trim();

    // Special case: minIntentLength === 0 means anything passes,
    // but we warn once on first write because opting out of the
    // protocol's core guarantee is a deliberate act (per API.md).
    if (minIntentLength === 0 && !zeroLengthWarned) {
      console.warn(
        "[@akashikprotocol/core] minIntentLength is 0. Intent enforcement is disabled. " +
          "This weakens the protocol's core guarantee.",
      );
      zeroLengthWarned = true;
    } else if (minIntentLength > 0 && trimmedIntent.length < minIntentLength) {
      throw new AkashikError(
        "INTENT_TOO_SHORT",
        `intent must be at least ${minIntentLength} characters (after trimming)`,
        { minIntentLength, actualLength: trimmedIntent.length },
      );
    }

    // 4. Construct the envelope around this operation (defensive validate).
    const message = wrap({
      type: "RECORD",
      sender: input.agent ?? "",
      epoch: epochCounter,
      payload: {
        entry: input.entry,
        intent: input.intent,
      },
    });
    unwrap(message);

    // 5. Construct the FieldEntry and store it.
    const fieldEntry: FieldEntry = {
      id: generateId(),
      timestamp: Date.now(),
      epoch: epochCounter++,
      ...(input.agent !== undefined && { agent: input.agent }),
      status: "committed",
      entry: input.entry,
      intent: input.intent,
    };

    entries.push(fieldEntry);

    return { id: fieldEntry.id, timestamp: fieldEntry.timestamp };
  }

  // read — retrieve entries, optionally filtered by query
  async function read(query?: ReadQuery): Promise<FieldEntry[]> {
    // 1. Validate query shape.
    if (query !== undefined && !isPlainObject(query)) {
      throw new AkashikError("INVALID_QUERY", "query must be a plain object or undefined", {
        received: query === null ? "null" : Array.isArray(query) ? "array" : typeof query,
      });
    }

    // 2. No query (or empty query) → return all entries in write order.
    if (query === undefined || Object.keys(query).length === 0) {
      return [...entries];
    }

    // 3. Filter: every key in query must match the same key in entry.entry.
    return entries.filter((fieldEntry) => matchesQuery(fieldEntry.entry, query));
  }

  // attune — surface relevant entries from other agents' perspectives
  async function attune(context: AttuneContext): Promise<FieldEntryWithRelevance[]> {
    // 1. Validate agent presence.
    if (
      context === undefined ||
      context === null ||
      typeof context !== "object" ||
      typeof context.agent !== "string" ||
      context.agent.trim().length === 0
    ) {
      throw new AkashikError("AGENT_REQUIRED", "attune() requires a non-empty agent identifier");
    }

    const { agent, topic } = context;

    // 2. Filter: exclude entries authored by the calling agent.
    //    Entries with no `agent` field are NOT excluded — they
    //    are treated as "not authored by the calling agent" per API.md.
    let visible = entries.filter((fieldEntry) => fieldEntry.agent !== agent);

    // 3. Apply topic filter if supplied.
    if (topic !== undefined) {
      visible = visible.filter((fieldEntry) => fieldEntry.entry.topic === topic);
    }

    // 4. Construct the envelope around this operation (defensive validate).
    const message = wrap({
      type: "ATTUNE",
      sender: agent,
      epoch: epochCounter,
      payload: {
        ...(topic !== undefined && { topic }),
      },
    });
    unwrap(message);

    // 5. Score every visible entry and sort by relevance descending, epoch descending.
    const callerSession = sessions.get(agent) ?? null;
    const scored: FieldEntryWithRelevance[] = visible.map((entry) => {
      const writerSession = entry.agent ? (sessions.get(entry.agent) ?? null) : null;
      const { score, reason } = computeRelevance(entry, context, {
        visibleEntries: visible,
        writerSession,
        callerSession,
      });
      return { ...entry, relevance_score: score, relevance_reason: reason };
    });

    scored.sort((a, b) => {
      if (b.relevance_score !== a.relevance_score) {
        return b.relevance_score - a.relevance_score;
      }
      return b.epoch - a.epoch;
    });

    return scored;
  }

  async function register(input: RegisterInput): Promise<RegisterResult> {
    // 1. Validate input.
    validateRegisterInput(input);

    // 2. Idempotent: same id returns the existing session if already registered.
    const existing = sessions.get(input.id);
    if (existing) {
      const message = wrap({
        type: "REGISTER",
        sender: input.id,
        epoch: epochCounter,
        payload: {
          id: input.id,
          role: existing.role,
          capabilities: existing.capabilities,
        },
      });
      unwrap(message);
      return {
        field_capabilities: [],
        field_protocol_version: protocolVersion(),
        session_id: existing.id,
      };
    }

    // 3. New registration. Create the session.
    const session: Session = {
      id: input.id,
      role: input.role,
      capabilities: input.capabilities ?? [],
      registered_at: Date.now(),
    };
    sessions.set(input.id, session);

    // 4. Wrap the operation in an envelope.
    const message = wrap({
      type: "REGISTER",
      sender: input.id,
      epoch: epochCounter,
      payload: {
        id: input.id,
        role: input.role,
        capabilities: input.capabilities ?? [],
      },
    });
    unwrap(message);

    // 5. Return capability exchange result.
    return {
      field_capabilities: [],
      field_protocol_version: protocolVersion(),
      session_id: session.id,
    };
  }

  async function deregister(input: { id: string }): Promise<void> {
    // 1. Validate input.
    if (!input || typeof input !== "object") {
      throw new AkashikError("AGENT_REQUIRED", "deregister() requires { id: string }");
    }
    if (typeof input.id !== "string" || input.id.trim().length === 0) {
      throw new AkashikError("AGENT_REQUIRED", "deregister() requires a non-empty id");
    }

    // 2. Wrap the operation in an envelope.
    const message = wrap({
      type: "DEREGISTER",
      sender: input.id,
      epoch: epochCounter,
      payload: { id: input.id },
    });
    unwrap(message);

    // 3. Idempotent: deregistering an unregistered agent is a no-op.
    sessions.delete(input.id);

    // 4. Drafts owned by this agent persist beyond DEREGISTER (Story 5 concern).
  }

  return { write, read, attune, register, deregister };
}

// ── private helpers ──────────────────────────────────────────────────────────

/** Check that a value is a plain object (not null, not array, not class instance, not primitive). */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

/** Does `entry` match every key/value in `query`?
 *  Equality is `===` for primitive values.
 *  For object values, performs shallow per-key `===` comparison.
 *  Deep matching is explicitly deferred to v0.2. */
function matchesQuery(entry: Record<string, unknown>, query: Record<string, unknown>): boolean {
  for (const key of Object.keys(query)) {
    const queryValue = query[key];
    const entryValue = entry[key];

    if (isPlainObject(queryValue)) {
      // Shallow per-key match for object values.
      if (!isPlainObject(entryValue)) return false;
      for (const innerKey of Object.keys(queryValue)) {
        if (queryValue[innerKey] !== entryValue[innerKey]) return false;
      }
    } else {
      // Primitive `===` match.
      if (queryValue !== entryValue) return false;
    }
  }
  return true;
}

/** Validates a RegisterInput. Throws AkashikError on invalid input. */
function validateRegisterInput(input: unknown): asserts input is RegisterInput {
  if (!input || typeof input !== "object") {
    throw new AkashikError("AGENT_REQUIRED", "register() requires { id, role, capabilities? }");
  }
  const i = input as Record<string, unknown>;

  if (typeof i.id !== "string" || i.id.trim().length === 0) {
    throw new AkashikError(
      "AGENT_REQUIRED",
      "register() requires a non-empty id (string, no whitespace-only)",
    );
  }
  if (typeof i.role !== "string" || i.role.trim().length === 0) {
    throw new AkashikError(
      "AGENT_REQUIRED",
      "register() requires a non-empty role (string, no whitespace-only)",
    );
  }
  if (
    i.capabilities !== undefined &&
    (!Array.isArray(i.capabilities) || !i.capabilities.every((c) => typeof c === "string"))
  ) {
    throw new AkashikError(
      "INVALID_ENTRY",
      "register() capabilities must be an array of strings if provided",
    );
  }
}
