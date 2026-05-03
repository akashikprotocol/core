import { AkashikError } from "./errors.js";
import { generateId } from "./id.js";
import type {
  AttuneContext,
  Field,
  FieldEntry,
  FieldOptions,
  ReadQuery,
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

    // 4. Construct the FieldEntry and store it.
    const fieldEntry: FieldEntry = {
      id: generateId(),
      timestamp: Date.now(),
      entry: input.entry,
      intent: input.intent,
      ...(input.agent !== undefined && { agent: input.agent }),
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
  async function attune(context: AttuneContext): Promise<FieldEntry[]> {
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
    let result = entries.filter((fieldEntry) => fieldEntry.agent !== agent);

    // 3. Apply topic filter if supplied.
    if (topic !== undefined) {
      result = result.filter((fieldEntry) => fieldEntry.entry.topic === topic);
    }

    // 4. Return in write order (already preserved by the entries array).
    return result;
  }

  return { write, read, attune };
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
