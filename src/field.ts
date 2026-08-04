import type { StorageAdapter } from "./adapter.js";
import { createMemoryAdapter } from "./adapters/memory.js";
import { createLamportClock } from "./clock.js";
import { findConflicts } from "./conflicts.js";
import { protocolVersion } from "./envelope.js";
import { AkashikError } from "./errors.js";
import { deregisterEvent, recordEvent, registerEvent, statusChangeEvent } from "./events.js";
import type { FieldEvent } from "./events.js";
import { generateId } from "./id.js";
import { compareEventOrder } from "./ordering.js";
import { applyEvent, emptyProjection } from "./projection.js";
import type { Projection } from "./projection.js";
import { computeRelevance } from "./relevance.js";
import { filterReplay } from "./replay.js";
import type { ReplayQuery } from "./replay.js";
import type {
  AttuneContext,
  CommitInput,
  CommitResult,
  DiscardInput,
  DraftInput,
  Field,
  FieldEntry,
  FieldEntryWithRelevance,
  FieldOptions,
  ReadOptions,
  ReadQuery,
  ReckonResult,
  RegisterInput,
  RegisterResult,
  RetractInput,
  SupersedeInput,
  SupersedeResult,
  WriteInput,
  WriteResult,
} from "./types.js";

// ── constants ────────────────────────────────────────────────────────────────

const DEFAULT_MIN_INTENT_LENGTH = 10;

// ── public API ───────────────────────────────────────────────────────────────

export function createField(options: FieldOptions = {}): Field {
  const adapter: StorageAdapter = options.adapter ?? createMemoryAdapter();
  const minIntentLength = options.minIntentLength ?? DEFAULT_MIN_INTENT_LENGTH;

  // The projection is the source of truth, derived from the adapter's log.
  // It is NEVER written to directly — only ever through applyEvent.
  let projection: Projection = emptyProjection();
  // Initialised at -1, not 0: tick() pre-increments, so the first local event
  // must land on 0 to match the epoch numbering shipped since v0.2/Story 1.
  // All clock manipulation goes through tick()/observe() — never a bare
  // increment — so the send and receive rules stay in exactly one place.
  const clock = createLamportClock(-1);
  let hydrated = false;
  let zeroLengthWarned = false;

  // Drafts stay private, in-memory, and never durable — mirrors v0.2 exactly.
  const drafts = new Map<string, FieldEntry>();

  // Supersession chain (predecessor id → superseding entry id). Rebuilt as
  // RECORD events carrying `supersedes` are applied, so it stays correct
  // across a projection catch-up, not just within a single supersede() call.
  const supersededBy = new Map<string, string>();

  // Apply one already-seq-stamped event to the local projection, advancing
  // the clock and the chain index. Every append path funnels through this,
  // so the projection, the clock, and the chain index never drift apart.
  function applyLocally(event: FieldEvent): void {
    applyEvent(projection, event);
    clock.observe(event.lamport); // receive rule, on every event applied
    if (event.type === "RECORD" && event.supersedes !== undefined) {
      supersededBy.set(event.supersedes, event.entry_id);
    }
  }

  /**
   * Bring the local projection up to date with the adapter. A no-op after the
   * first call for a single-process MemoryAdapter, but it is the seam that
   * persistent and multi-process adapters depend on. Kept in every path,
   * and run before every clock.tick() call site so the receive rule always
   * completes before the send rule.
   */
  async function ensureCurrent(): Promise<void> {
    if (!hydrated) {
      const loaded = await adapter.loadProjection();
      if (loaded) {
        projection = loaded;
        clock.observe(loaded.maxLamport); // receive rule, on snapshot load
      }
      hydrated = true;
    }
    const missed = await adapter.readEvents({ sinceSeq: projection.upToSeq });
    if (missed.length > 0) {
      for (const event of [...missed].sort(compareEventOrder)) {
        applyLocally(event);
      }
    }
  }

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

    // 4. Bring the projection current, then append and apply.
    await ensureCurrent();

    const event = recordEvent({
      lamport: clock.tick(),
      agent: input.agent ?? null,
      entry_id: generateId(),
      entry: input.entry,
      intent: input.intent,
    });

    // Re-catch-up after append rather than applying `event` directly: under
    // concurrent access another process may have claimed a lower seq that
    // this field hasn't read yet. Jumping straight to our own (possibly
    // higher) seq would permanently skip it — sinceSeq only ever looks
    // forward. Reading from the adapter again picks up everything in order,
    // our own event included.
    await adapter.append([event]);
    await ensureCurrent();

    return { id: event.entry_id, timestamp: event.wall_time };
  }

  // read — retrieve entries, optionally filtered by query
  async function read(query?: ReadQuery, readOptions?: ReadOptions): Promise<FieldEntry[]> {
    // 1. Validate query shape.
    if (query !== undefined && !isPlainObject(query)) {
      throw new AkashikError("INVALID_QUERY", "query must be a plain object or undefined", {
        received: query === null ? "null" : Array.isArray(query) ? "array" : typeof query,
      });
    }

    await ensureCurrent();

    // 2. Build candidate set: committed/retracted/superseded entries + caller's own drafts.
    const caller = readOptions?.caller;
    const visibleDrafts: FieldEntry[] = [];
    if (caller !== undefined) {
      for (const draft of drafts.values()) {
        if (draft.agent === caller) {
          visibleDrafts.push(draft);
        }
      }
    }
    const candidate = [...projection.entries.values(), ...visibleDrafts];

    // 3. No query (or empty query) → return all candidates in write order.
    if (query === undefined || Object.keys(query).length === 0) {
      return candidate;
    }

    // 4. Filter: every key in query must match the same key in entry.entry.
    return candidate.filter((fieldEntry) => matchesQuery(fieldEntry.entry, query));
  }

  // scopedView — the shared core of attune() and reckon().
  //
  // Both operations surface the same relevance-ranked, capped view of the
  // field; reckon() simply runs conflict detection over the result. Keeping
  // this in one place guarantees attune and reckon never drift in visibility,
  // scoring, ordering, or truncation. Agent validation stays in each public
  // method so error messages name the operation the caller actually invoked.
  async function scopedView(context: AttuneContext): Promise<FieldEntryWithRelevance[]> {
    await ensureCurrent();

    const { agent, topic } = context;

    // 1. Filter: exclude entries authored by the calling agent.
    //    Entries with no `agent` field are NOT excluded — they
    //    are treated as "not authored by the calling agent" per API.md.
    let visible = [...projection.entries.values()].filter(
      (fieldEntry) => fieldEntry.agent !== agent,
    );

    // 2. Apply topic filter if supplied.
    if (topic !== undefined) {
      visible = visible.filter((fieldEntry) => fieldEntry.entry.topic === topic);
    }

    // 3. Filter by status — only committed entries are visible to others.
    //    Retracted and superseded entries are excluded. Drafts of other agents
    //    are already absent (they live in the drafts Map, not the projection).
    visible = visible.filter((fieldEntry) => fieldEntry.status === "committed");

    // 4. Include the calling agent's own drafts (private scratchpad).
    for (const draft of drafts.values()) {
      if (draft.agent === agent) {
        if (topic === undefined || draft.entry.topic === topic) {
          visible.push(draft);
        }
      }
    }

    // 5. Validate max_units before scoring.
    const limit = context.max_units ?? 100;
    if (limit < 0) {
      throw new AkashikError("INVALID_QUERY", "max_units must be non-negative");
    }

    // 6. Score every visible entry and sort by relevance descending, epoch descending.
    const callerSession = projection.sessions.get(agent) ?? null;
    const scored: FieldEntryWithRelevance[] = visible.map((entry) => {
      const writerSession = entry.agent ? (projection.sessions.get(entry.agent) ?? null) : null;
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

    // 7. Apply max_units cap (drop lowest-relevance entries first).
    return scored.slice(0, limit);
  }

  // attune — surface relevant entries from other agents' perspectives
  async function attune(context: AttuneContext): Promise<FieldEntryWithRelevance[]> {
    // Validate agent presence.
    if (
      context === undefined ||
      context === null ||
      typeof context !== "object" ||
      typeof context.agent !== "string" ||
      context.agent.trim().length === 0
    ) {
      throw new AkashikError("AGENT_REQUIRED", "attune() requires a non-empty agent identifier");
    }

    return scopedView(context);
  }

  async function register(input: RegisterInput): Promise<RegisterResult> {
    // 1. Validate input.
    validateRegisterInput(input);
    await ensureCurrent();

    // 2. Idempotent: same id returns the existing session unchanged. No event
    //    is appended — v0.2 never updated role/capabilities on re-registration.
    const existing = projection.sessions.get(input.id);
    if (existing) {
      return {
        field_capabilities: [],
        field_protocol_version: protocolVersion(),
        session_id: input.id,
      };
    }

    // 3. New registration. register() never ticks the clock (v0.2 never
    //    advanced its counter for register either), so this stamps whatever
    //    the clock currently reads. Floored at 0: the clock starts at -1 so
    //    the first entry-producing tick lands on 0, but a persisted event's
    //    own lamport should never be negative.
    const event = registerEvent({
      lamport: Math.max(clock.current(), 0),
      agent: input.id,
      entry_id: input.id,
      role: input.role,
      capabilities: input.capabilities ?? [],
    });
    // See write() for why this re-catches-up instead of applying directly.
    await adapter.append([event]);
    await ensureCurrent();

    return {
      field_capabilities: [],
      field_protocol_version: protocolVersion(),
      session_id: input.id,
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

    await ensureCurrent();

    // 2. Idempotent: deregistering an unregistered agent is a no-op in effect
    //    (applyEvent's DEREGISTER case is a no-op on a missing session), but
    //    the event is still appended for a durable audit trail.
    // Floored at 0 for the same reason as register() above.
    const event = deregisterEvent({
      lamport: Math.max(clock.current(), 0),
      agent: input.id,
      entry_id: input.id,
    });
    // See write() for why this re-catches-up instead of applying directly.
    await adapter.append([event]);
    await ensureCurrent();

    // 3. Drafts owned by this agent persist beyond DEREGISTER (Story 5 concern).
  }

  async function draft(input: DraftInput): Promise<{ draft_id: string }> {
    // 1. Validate (same rules as write).
    if (!isPlainObject(input?.entry)) {
      throw new AkashikError("INVALID_ENTRY", "entry must be a plain object", {
        received: typeof input?.entry,
      });
    }
    if (input.intent === undefined || input.intent === null) {
      throw new AkashikError("INTENT_REQUIRED", "intent is required on every draft");
    }
    if (typeof input.intent !== "string") {
      throw new AkashikError("INTENT_REQUIRED", "intent must be a string");
    }
    const trimmedIntent = input.intent.trim();
    if (trimmedIntent.length === 0) {
      throw new AkashikError("INTENT_REQUIRED", "intent must not be empty");
    }
    if (minIntentLength > 0 && trimmedIntent.length < minIntentLength) {
      throw new AkashikError(
        "INTENT_TOO_SHORT",
        `intent must be at least ${minIntentLength} characters (after trimming)`,
        { minIntentLength, actualLength: trimmedIntent.length },
      );
    }

    await ensureCurrent();

    // 2. Generate the entry with status "draft". Reserves its own clock
    //    tick (so a later commit always gets a strictly higher one) but is
    //    kept private — never appended as an event until commit or discard.
    const newEntry: FieldEntry = {
      id: generateId(),
      timestamp: Date.now(),
      epoch: clock.tick(),
      ...(input.agent !== undefined && { agent: input.agent }),
      status: "draft",
      entry: input.entry,
      intent: input.intent,
    };

    // 3. Store in the private drafts Map.
    drafts.set(newEntry.id, newEntry);

    return { draft_id: newEntry.id };
  }

  async function commit(input: CommitInput): Promise<CommitResult> {
    // 1. Validate draft_id.
    if (!input || typeof input.draft_id !== "string" || input.draft_id.length === 0) {
      throw new AkashikError("DRAFT_NOT_FOUND", "commit() requires a non-empty draft_id");
    }

    await ensureCurrent();

    // 2. Locate draft.
    const draftEntry = drafts.get(input.draft_id);
    if (!draftEntry) {
      throw new AkashikError("DRAFT_NOT_FOUND", `no draft found with id: ${input.draft_id}`);
    }

    // 3. Promote: append a RECORD event under the draft's original id.
    const event = recordEvent({
      lamport: clock.tick(),
      agent: draftEntry.agent ?? null,
      entry_id: draftEntry.id,
      entry: draftEntry.entry,
      intent: draftEntry.intent,
    });
    // See write() for why this re-catches-up instead of applying directly.
    await adapter.append([event]);
    await ensureCurrent();

    // 4. Drop the private draft.
    drafts.delete(input.draft_id);

    return { id: event.entry_id, epoch: event.lamport, timestamp: event.wall_time };
  }

  async function discard(input: DiscardInput): Promise<void> {
    // 1. Validate draft_id.
    if (!input || typeof input.draft_id !== "string" || input.draft_id.length === 0) {
      throw new AkashikError("DRAFT_NOT_FOUND", "discard() requires a non-empty draft_id");
    }

    await ensureCurrent();

    // 2. Locate draft (before intent validation so DRAFT_NOT_FOUND takes precedence).
    const draftEntry = drafts.get(input.draft_id);
    if (!draftEntry) {
      throw new AkashikError("DRAFT_NOT_FOUND", `no draft found with id: ${input.draft_id}`);
    }

    // 3. Validate intent (same minIntentLength rule as write).
    if (input.intent === undefined || input.intent === null || input.intent === "") {
      throw new AkashikError("INTENT_REQUIRED", "discard() requires a non-empty intent");
    }
    if (typeof input.intent !== "string") {
      throw new AkashikError("INTENT_REQUIRED", "intent must be a string");
    }
    const trimmedIntent = input.intent.trim();
    if (minIntentLength > 0 && trimmedIntent.length < minIntentLength) {
      throw new AkashikError(
        "INTENT_TOO_SHORT",
        `discard() intent must be at least ${minIntentLength} characters`,
        { minIntentLength, actualLength: trimmedIntent.length },
      );
    }

    // 4. A discarded draft was never durable. Establish it, then retract it,
    //    as one atomic batch — the audit trail a v0.2 caller expects, built
    //    from the two log event types that exist. Final intent is the
    //    discard reason, mirroring v0.2's override of the original intent.
    const recordEv = recordEvent({
      lamport: clock.tick(),
      agent: draftEntry.agent ?? null,
      entry_id: draftEntry.id,
      entry: draftEntry.entry,
      intent: input.intent,
    });
    const statusEv = statusChangeEvent({
      lamport: clock.tick(),
      agent: input.agent ?? draftEntry.agent ?? null,
      entry_id: draftEntry.id,
      new_status: "retracted",
      intent: input.intent,
    });

    // See write() for why this re-catches-up instead of applying directly.
    await adapter.append([recordEv, statusEv]);
    await ensureCurrent();

    // 5. Drop the private draft.
    drafts.delete(input.draft_id);
  }

  async function retract(input: RetractInput): Promise<void> {
    // 1. Validate input shape.
    if (!input || typeof input !== "object") {
      throw new AkashikError("ENTRY_NOT_FOUND", "retract() requires input object");
    }
    if (typeof input.id !== "string" || input.id.length === 0) {
      throw new AkashikError("ENTRY_NOT_FOUND", "retract() requires a non-empty id");
    }
    if (typeof input.agent !== "string" || input.agent.trim().length === 0) {
      throw new AkashikError("AGENT_REQUIRED", "retract() requires a non-empty agent");
    }
    if (typeof input.intent !== "string" || input.intent.trim().length < minIntentLength) {
      throw new AkashikError(
        "INTENT_TOO_SHORT",
        `retract() requires intent of length >= ${minIntentLength}`,
      );
    }

    await ensureCurrent();

    // 2. Locate the entry.
    const target = projection.entries.get(input.id);
    if (!target) {
      throw new AkashikError("ENTRY_NOT_FOUND", `no entry found with id: ${input.id}`);
    }

    // 3. Authorisation: only the original writer can retract.
    if (target.agent !== input.agent) {
      throw new AkashikError(
        "RETRACT_NOT_AUTHORIZED",
        `retract() can only be performed by the original writer (entry author: ${target.agent ?? "<none>"}, caller: ${input.agent})`,
      );
    }

    // 4. Idempotence: already-retracted or superseded entries are a no-op.
    if (target.status === "retracted" || target.status === "superseded") {
      return;
    }

    // 5. Append and apply.
    const event = statusChangeEvent({
      lamport: clock.tick(),
      agent: input.agent,
      entry_id: input.id,
      new_status: "retracted",
      intent: input.intent,
    });
    // See write() for why this re-catches-up instead of applying directly.
    await adapter.append([event]);
    await ensureCurrent();
  }

  async function supersede(input: SupersedeInput): Promise<SupersedeResult> {
    // 1. Validate input shape.
    if (!input || typeof input !== "object") {
      throw new AkashikError("ENTRY_NOT_FOUND", "supersede() requires input object");
    }
    if (typeof input.superseding_id !== "string" || input.superseding_id.length === 0) {
      throw new AkashikError("ENTRY_NOT_FOUND", "supersede() requires a non-empty superseding_id");
    }
    if (!isPlainObject(input.entry)) {
      throw new AkashikError("INVALID_ENTRY", "supersede() requires an entry object");
    }
    if (typeof input.agent !== "string" || input.agent.trim().length === 0) {
      throw new AkashikError("AGENT_REQUIRED", "supersede() requires a non-empty agent");
    }
    if (typeof input.intent !== "string" || input.intent.trim().length < minIntentLength) {
      throw new AkashikError(
        "INTENT_TOO_SHORT",
        `supersede() requires intent of length >= ${minIntentLength}`,
      );
    }

    await ensureCurrent();

    // 2. Locate the targeted predecessor.
    const targeted = projection.entries.get(input.superseding_id);
    if (!targeted) {
      throw new AkashikError("ENTRY_NOT_FOUND", `no entry found with id: ${input.superseding_id}`);
    }

    // 3. Cannot supersede a retracted entry.
    if (targeted.status === "retracted") {
      throw new AkashikError("ENTRY_NOT_FOUND", "cannot supersede a retracted entry");
    }

    // 4. Follow the chain to find the current latest committed entry.
    let actualPredecessorId = input.superseding_id;
    while (supersededBy.has(actualPredecessorId)) {
      actualPredecessorId = supersededBy.get(actualPredecessorId) as string;
    }
    const actualPredecessor = projection.entries.get(actualPredecessorId);
    if (!actualPredecessor || actualPredecessor.status !== "committed") {
      throw new AkashikError(
        "ENTRY_NOT_FOUND",
        `chain resolution failed for superseding_id: ${input.superseding_id}`,
      );
    }

    // 5. Two events in one atomic batch: mark the predecessor superseded,
    //    then record the new entry, linked back via `supersedes`.
    const markOld = statusChangeEvent({
      lamport: clock.tick(),
      agent: input.agent,
      entry_id: actualPredecessorId,
      new_status: "superseded",
      intent: input.intent,
    });
    const newRecord = recordEvent({
      lamport: clock.tick(),
      agent: input.agent,
      entry_id: generateId(),
      entry: input.entry,
      intent: input.intent,
      supersedes: actualPredecessorId,
    });

    // See write() for why this re-catches-up instead of applying directly.
    await adapter.append([markOld, newRecord]);
    await ensureCurrent();

    return { id: newRecord.entry_id, epoch: newRecord.lamport, timestamp: newRecord.wall_time };
  }

  async function reckon(context: AttuneContext): Promise<ReckonResult> {
    // Validate context (same rules as attune).
    if (
      context === undefined ||
      context === null ||
      typeof context !== "object" ||
      typeof context.agent !== "string" ||
      context.agent.trim().length === 0
    ) {
      throw new AkashikError("AGENT_REQUIRED", "reckon() requires a non-empty agent identifier");
    }

    // reckon is attune plus conflict detection over the surfaced set.
    const cappedEntries = await scopedView(context);
    const conflicts = findConflicts(cappedEntries);

    return { entries: cappedEntries, conflicts };
  }

  // replay — walk the append-only event log, filtered and optionally
  // chain-resolved. Read-only: never mutates the log or the projection.
  async function replay(query: ReplayQuery = {}): Promise<FieldEvent[]> {
    await ensureCurrent();

    // Push down what the adapter can filter efficiently; the rest is done
    // here. entry_id and chain-following cannot be pushed down (they need
    // the full set), so when entry_id is present we read unscoped.
    const canPushDown = query.entry_id === undefined;

    const events = await adapter.readEvents(
      canPushDown
        ? {
            scope: {
              ...(query.topic !== undefined ? { topic: query.topic } : {}),
              ...(query.agent !== undefined ? { agent: query.agent } : {}),
            },
            ...(query.sinceSeq !== undefined ? { sinceSeq: query.sinceSeq } : {}),
          }
        : {},
    );

    const ordered = [...events].sort(compareEventOrder);
    return filterReplay(ordered, query);
  }

  return {
    write,
    read,
    attune,
    register,
    deregister,
    draft,
    commit,
    discard,
    retract,
    supersede,
    reckon,
    replay,
  };
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
