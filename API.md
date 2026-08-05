# API, `@akashikprotocol/core` v0.3

This document is the complete public surface of the v0.3 SDK. Every function, argument, return shape, and error listed here is part of the contract. Nothing outside this document is public API.

All v0.1 and v0.2 code continues to work without changes. Every v0.3 addition is strictly additive at the API surface.

---

## Design principles

1. **Intent is mandatory on every write.** Not a convention, enforced at runtime with a typed error.
2. **The protocol decides relevance, not the caller.** `attune()` is opinionated by design.
3. **Declarative over imperative.** Queries describe *what* the caller wants, not *how* to fetch it.
4. **Conflict surfacing, not conflict resolution.** The protocol detects disagreement and hands it back. Resolution is always the agent's job. Confidence, where supplied, is visible on both sides of a conflict and never used to pick a winner; the same discipline applies to it as to any other resolution shortcut.
5. **Mechanical now, semantic later.** Relevance scoring and conflict detection are feature-weighted and key-value mechanical at Level 1. No embeddings, no LLM calls inside protocol primitives.

---

## Quick start

```ts
import { createField } from "@akashikprotocol/core";

const field = createField();

await field.register({ id: "researcher", role: "researcher" });
await field.register({ id: "fact-checker", role: "researcher" });

await field.write({
  entry: { topic: "competitor-pricing", price: "$49/mo" },
  intent: "documenting competitor pricing observed on g2",
  agent: "researcher",
});

await field.write({
  entry: { topic: "competitor-pricing", price: "$39/mo" },
  intent: "fact-checker correction after verifying competitor site directly",
  agent: "fact-checker",
});

const { entries, conflicts } = await field.reckon({
  agent: "writer",
  topic: "competitor-pricing",
});
// entries: two scored entries, sorted by relevance
// conflicts: [{ a, b, keys: ["price"] }]
```

Persistence is a constructor argument, not a different API. Pass an `adapter` and every method above behaves identically:

```ts
import { createField } from "@akashikprotocol/core";
import { createFileAdapter } from "@akashikprotocol/core/file";

const adapter = createFileAdapter({ path: "./field.jsonl" });
await adapter.init?.();
const field = createField({ adapter });
```

See [ADAPTERS.md](./docs/ADAPTERS.md) for `FileAdapter` and `PostgresAdapter` configuration.

---

## Entry point

### `createField(options?)`

Creates a new Field, the shared memory surface agents read from and write to.

```ts
function createField(options?: FieldOptions): Field;

type FieldOptions = {
  /** Minimum length for the intent string, after trimming. Default: 10. */
  minIntentLength?: number;
  /** Storage backend. Defaults to an in-memory MemoryAdapter. */
  adapter?: StorageAdapter;
};
```

- `minIntentLength` defaults to `10`. Setting it to `0` is legal but logs a console warning on first write.
- `adapter` defaults to an internally-constructed `MemoryAdapter`. Pass `createFileAdapter(...)` or `createPostgresAdapter(...)` for a durable field. All `Field` methods behave identically regardless of adapter.
- All methods return Promises.

---

## Methods on `Field`

### `field.write({ entry, intent, agent?, confidence? })`

Writes a committed entry to the Field, tagged with the agent's intent.

```ts
write(input: WriteInput): Promise<WriteResult>;

type WriteInput = {
  entry: Record<string, unknown>;
  intent: string;
  agent?: string;
  confidence?: Confidence;
};

type WriteResult = {
  id: string;       // ULID
  timestamp: number; // Unix milliseconds
};
```

- `entry` is a plain object. Any JSON-serialisable shape is accepted.
- `intent` must be at least `minIntentLength` characters after trimming.
- `agent` is optional but strongly recommended; it drives `attune()` filtering, conflict detection, and `retract()` authorization.
- `confidence` is optional. See [Confidence](#confidence) below. Never affects relevance scoring or conflict detection.
- The written entry gets `status: "committed"` and an `epoch` value from the field's Lamport clock.

**Rejects with**

| Code | When |
|------|------|
| `INTENT_REQUIRED` | `intent` is missing, null, or undefined |
| `INTENT_TOO_SHORT` | `intent.trim().length < minIntentLength` |
| `INVALID_ENTRY` | `entry` is not a plain object |
| `INVALID_CONFIDENCE` | `confidence` is present but malformed (see below) |

---

### `field.read(query?, options?)`

Retrieves entries matching a query. Returns entries in write order (oldest first).

```ts
read(query?: ReadQuery, options?: ReadOptions): Promise<FieldEntry[]>;

type ReadQuery = Record<string, unknown>;

type ReadOptions = {
  /** When provided, the caller's own draft entries are included in results. */
  caller?: string;
};
```

- `read()` with no argument returns all committed entries.
- `read(query)` returns entries where every key in `query` matches the corresponding key in `entry` (`===` for primitives).
- Retracted and superseded entries are included in results (callers can filter by `status`).
- Draft entries are excluded unless `options.caller` matches their `agent`.

**Rejects with**

| Code | When |
|------|------|
| `INVALID_QUERY` | `query` is neither undefined nor a plain object |

---

### `field.attune(context)`

Surfaces what's relevant to an agent right now. Scores visible entries by relevance, sorts highest-first, and returns scored entries with metadata.

```ts
attune(context: AttuneContext): Promise<FieldEntryWithRelevance[]>;

type AttuneContext = {
  agent: string;
  topic?: string;
  role?: string;
  max_units?: number;
  since_epoch?: number;
};
```

**Visibility rules**

- The calling agent's own committed entries are **never** visible (unconditional self-filter).
- The calling agent's own **drafts** are visible.
- Other agents' drafts are never visible.
- Retracted and superseded entries are never visible.

**Relevance scoring**

Each visible entry is scored across four components:

| Component | Max weight | What it measures |
|-----------|-----------|-----------------|
| `topic`   | 0.60 | `entry.topic === context.topic` |
| `role`    | 0.20 | Writer's role matches caller's role |
| `recency` | 0.15 | How recently written, relative to the visible set |
| `intent`  | 0.05 | Substantiveness of the intent string |

`relevance_score` is a float in [0, 1]. `relevance_reason` breaks down each component's contribution. `confidence`, if the writer supplied one, is present on the returned entry and never contributes to `relevance_score`.

**Parameters**

- `topic`, filters to entries with matching `entry.topic` and adds full topic weight to their score. Omit to scan the full field.
- `role`, explicit role for role-match scoring. Falls back to the agent's registered session role.
- `max_units`, cap on returned entries. Entries beyond the cap (lowest relevance first) are dropped. Default `100`. Negative values throw `INVALID_QUERY`.
- `since_epoch`, polling watermark. Only entries with `epoch` strictly greater than this value are returned. See [Polling](#polling-with-since_epoch) below.

**Rejects with**

| Code | When |
|------|------|
| `AGENT_REQUIRED` | `agent` is missing or empty |
| `INVALID_QUERY` | `max_units` is negative, or `since_epoch` is not a non-negative integer |

---

### `field.reckon(context)`

Identical visibility and scoring to `attune`, plus conflict detection across the returned entries.

```ts
reckon(context: AttuneContext): Promise<ReckonResult>;

type ReckonResult = {
  entries: FieldEntryWithRelevance[];
  conflicts: Conflict[];
};

type Conflict = {
  a: FieldEntry;
  b: FieldEntry;
  keys: string[]; // shared keys whose values disagree, sorted alphabetically
};
```

**Conflict detection rules**

Two entries conflict when:
1. They share the same `entry.topic` (strict equality).
2. They share at least one other key in `entry`.
3. Values at that shared key differ and both values are primitive (`string`, `number`, `boolean`, or `null`).

Object-valued keys do not produce conflicts. Each conflicting pair appears once (`a` vs `b`, not `b` vs `a`). Pairs are sorted by the timestamp of the newer entry, ascending. Confidence, where present on either entry, does not affect whether a conflict is detected, suppressed, or ordered.

`reckon` accepts `since_epoch` exactly as `attune` does. A watermark-filtered `reckon` call detects conflicts only among the entries that survive the watermark, not between a new entry and an older one already polled.

Use `reckon` when the calling agent needs to know about disagreement before deciding how to act. Use `attune` when you want the scored surface without conflict commentary.

**Rejects with**

| Code | When |
|------|------|
| `AGENT_REQUIRED` | `agent` is missing or empty |
| `INVALID_QUERY` | `max_units` is negative, or `since_epoch` is not a non-negative integer |

---

### `field.register({ id, role, capabilities? })`

Registers an agent with the Field, establishing a session with a declared role.

```ts
register(input: RegisterInput): Promise<RegisterResult>;

type RegisterInput = {
  id: string;
  role: string;
  capabilities?: string[];
};

type RegisterResult = {
  field_capabilities: string[];
  field_protocol_version: string;
  session_id?: string;
};
```

- `role` is used for relevance scoring in `attune()` and `reckon()`.
- `capabilities` is advisory. Agents declare what they can do; the Field records it and never rejects a registration based on the declared list, however unfamiliar the strings.
- Re-registering the same `id` is idempotent and returns the existing session unchanged; a second call does not update `role` or `capabilities`.
- `field_capabilities` advertises the conformance levels the field satisfies (`FIELD_PROTOCOL_LEVELS`, `["L0", "L1"]` for v0.3) plus any flags the storage adapter contributes. `"durable"` is the only recognised adapter flag; `MemoryAdapter` does not advertise it, `FileAdapter` and `PostgresAdapter` do.
- `field_protocol_version` is always `"0.2"` for this release; it tracks envelope/wire semantics, not the SDK's conformance level.

**Rejects with**

| Code | When |
|------|------|
| `AGENT_REQUIRED` | `id` or `role` is missing, empty, whitespace-only, or not a string |
| `INVALID_ENTRY` | `capabilities` is provided but is not an array of strings |

---

### `field.deregister({ id })`

Removes an agent's session from the Field.

```ts
deregister(input: { id: string }): Promise<void>;
```

- Idempotent. Deregistering an unknown `id` succeeds silently.
- Does not affect entries the agent has written; they remain in the Field.

---

### `field.draft({ entry, intent, agent?, confidence? })`

Creates a draft entry, visible only to its author until committed.

```ts
draft(input: DraftInput): Promise<{ draft_id: string }>;

type DraftInput = {
  entry: Record<string, unknown>;
  intent: string;
  agent?: string;
  confidence?: Confidence;
};
```

- Draft entries have `status: "draft"` and do not appear in other agents' `attune()` or `reckon()` results.
- The author sees their own drafts via `attune()`, `reckon()`, and `read({ caller: agent })`, including under a `since_epoch` filter.
- `draft_id` is a ULID and is stable through `commit()`.
- `confidence`, if supplied, carries through unchanged to the committed entry. `commit()` does not accept a separate confidence value; the draft's is the one source of truth.

**Rejects with**

| Code | When |
|------|------|
| `INTENT_REQUIRED` | `intent` is missing, null, or undefined |
| `INTENT_TOO_SHORT` | `intent.trim().length < minIntentLength` |
| `INVALID_ENTRY` | `entry` is not a plain object |
| `INVALID_CONFIDENCE` | `confidence` is present but malformed |

---

### `field.commit({ draft_id })`

Promotes a draft to a committed entry. The entry's `id` is preserved; `status`, `epoch`, and `timestamp` are updated.

```ts
commit(input: CommitInput): Promise<CommitResult>;

type CommitInput = {
  draft_id: string;
};

type CommitResult = {
  id: string;
  epoch: number;
  timestamp: number;
};
```

- After commit the entry becomes visible to all agents via `attune()` and `reckon()`.

**Rejects with**

| Code | When |
|------|------|
| `DRAFT_NOT_FOUND` | No draft with `draft_id` exists |

---

### `field.discard({ draft_id, intent, agent? })`

Discards a draft without committing it. A retracted audit entry remains in the Field under the draft's original id, visible via `read()` but never via `attune()` or `reckon()`.

```ts
discard(input: DiscardInput): Promise<void>;

type DiscardInput = {
  draft_id: string;
  intent: string;
  agent?: string;
};
```

- `intent` is required on discard; the reason for discarding is itself a signal, and it becomes the retracted entry's recorded intent.

**Rejects with**

| Code | When |
|------|------|
| `DRAFT_NOT_FOUND` | No draft with `draft_id` exists |
| `INTENT_REQUIRED` | `intent` is missing, null, or undefined |
| `INTENT_TOO_SHORT` | `intent.trim().length < minIntentLength` |

---

### `field.retract({ id, intent, agent })`

Marks a committed entry as retracted. Retracted entries are no longer visible in `attune()` or `reckon()`.

```ts
retract(input: RetractInput): Promise<void>;

type RetractInput = {
  id: string;
  intent: string;
  agent: string;
};
```

- Only the original author (matching `agent`) may retract an entry.
- Retracting an already-retracted or superseded entry is a no-op (idempotent).
- `intent` is required; the reason for retraction is part of the record.
- A retraction cannot be communicated through `attune({ since_epoch })` polling; a retracted entry simply stops appearing. Use `replay({ sinceSeq })` for a poller that needs to know about retractions.

**Rejects with**

| Code | When |
|------|------|
| `ENTRY_NOT_FOUND` | No entry with `id` exists |
| `RETRACT_NOT_AUTHORIZED` | Calling `agent` does not match the entry's author |
| `INTENT_REQUIRED` | `intent` is missing, null, or undefined |
| `INTENT_TOO_SHORT` | `intent.trim().length < minIntentLength` |

---

### `field.supersede({ superseding_id, entry, intent, agent, confidence? })`

Creates a new entry that replaces a previous one. The predecessor is marked `"superseded"` and disappears from `attune()` and `reckon()`.

```ts
supersede(input: SupersedeInput): Promise<SupersedeResult>;

type SupersedeInput = {
  superseding_id: string;  // id of the entry being replaced
  entry: Record<string, unknown>;
  intent: string;
  agent: string;
  confidence?: Confidence;
};

type SupersedeResult = {
  id: string;       // new entry's ULID
  epoch: number;
  timestamp: number;
};
```

- Any agent may supersede any committed entry; authorization is not enforced.
- Retracted entries cannot be superseded; retract is final.
- If the predecessor has already been superseded, `supersede()` follows the chain to the latest entry and uses that as the actual predecessor. The chain always resolves to the newest version, from any starting link.
- The new entry has `status: "committed"` immediately.
- `confidence` applies to the new entry only. The predecessor's own confidence, if it had one, is untouched by this call.

**Rejects with**

| Code | When |
|------|------|
| `ENTRY_NOT_FOUND` | No entry with `superseding_id` exists |
| `INVALID_ENTRY` | `entry` is not a plain object |
| `INTENT_REQUIRED` | `intent` is missing, null, or undefined |
| `INTENT_TOO_SHORT` | `intent.trim().length < minIntentLength` |
| `AGENT_REQUIRED` | `agent` is missing or empty |
| `INVALID_CONFIDENCE` | `confidence` is present but malformed |

---

### `field.replay(query?)`

Walks the field's append-only event log in causal order, filtered and optionally chain-resolved. Read-only; never mutates the log or derived state.

```ts
replay(query?: ReplayQuery): Promise<FieldEvent[]>;

type ReplayQuery = {
  entry_id?: string;
  topic?: string;
  agent?: string;
  sinceSeq?: number;
  untilSeq?: number;
  followChain?: boolean;
};
```

- With no query, returns every event the field has recorded, in total order.
- `entry_id` restricts to events concerning that entry. `followChain` defaults to `true` when `entry_id` is set: the result also includes every entry in the same supersession chain, walked in both directions, resolved over the full event set before other filters narrow it.
- `topic` restricts to `RECORD` events on that topic. Non-RECORD events, including `STATUS_CHANGE`, carry no topic and are excluded by this filter; a topic-scoped replay will not show that topic's retractions. Use `entry_id` with chain following for a complete story on one entry's lineage.
- `agent`, `sinceSeq`, and `untilSeq` filter as their names suggest, combining with AND semantics.
- There is no `stateAt()` method. State at a point in the log composes from public parts: `buildProjection(await field.replay({ untilSeq: n }))`.

See [REPLAY.md](./docs/REPLAY.md) for the full reasoning and a worked chain-following example.

This method never rejects with a Field-specific error beyond what an underlying adapter might throw (see `STORAGE_ERROR` below).

---

## Storage adapters

A Field is a coordinator over a `StorageAdapter`. Three adapters ship in this package.

### `createMemoryAdapter()`

```ts
import { createMemoryAdapter } from "@akashikprotocol/core";

function createMemoryAdapter(): StorageAdapter;
```

In-memory, not durable. This is what `createField()` uses internally when no `adapter` is passed. `capabilities` is `[]`.

### `createPostgresAdapter(options)`

```ts
import { createPostgresAdapter } from "@akashikprotocol/core/postgres";

function createPostgresAdapter(options: PostgresAdapterOptions): StorageAdapter;

type PostgresAdapterOptions = {
  pool?: Pool;              // an existing pg Pool; either this or connectionString is required
  connectionString?: string; // a Pool is created and owned by the adapter
  fieldId?: string;          // namespaces this field within the database; defaults to "default"
};
```

Reached only through the `@akashikprotocol/core/postgres` subpath. Requires the optional peer dependency `pg`, installed separately. `capabilities` is `["durable"]`. An injected `pool` is not closed by `adapter.close()`.

### `createFileAdapter(options)`

```ts
import { createFileAdapter } from "@akashikprotocol/core/file";

function createFileAdapter(options: FileAdapterOptions): StorageAdapter;

type FileAdapterOptions = {
  path: string; // the field's identity; separate fields use separate files
};
```

Reached only through the `@akashikprotocol/core/file` subpath. Uses only `node:fs` and `node:path`; nothing extra to install. `capabilities` is `["durable"]`. Relative paths resolve against `process.cwd()` at construction time.

See [ADAPTERS.md](./docs/ADAPTERS.md) for the full comparison, configuration details, and the two non-optional guarantees a custom adapter must satisfy.

---

## Types

### `FieldEntry`

The canonical entry shape returned by `read()`.

```ts
type FieldEntry = {
  id: string;
  timestamp: number;
  epoch: number;
  agent?: string;
  status: FieldEntryStatus;
  entry: Record<string, unknown>;
  intent: string;
  confidence?: Confidence;
};

type FieldEntryStatus = "committed" | "draft" | "retracted" | "superseded";
```

- `epoch` is the entry's Lamport clock value. Within a single process it behaves like a monotonic counter; across processes sharing one field, it establishes correct causal order, with ties broken by agent id and then event id.
- `status` reflects the entry's lifecycle state.
- `confidence` is present only when the writer supplied one.

### `FieldEntryWithRelevance`

Returned by `attune()` and in `ReckonResult.entries`. Extends `FieldEntry` with scoring metadata.

```ts
type FieldEntryWithRelevance = FieldEntry & {
  relevance_score: number;       // 0.0 to 1.0
  relevance_reason: RelevanceReason;
};

type RelevanceReason = {
  components: {
    topic: number;   // 0 to 0.60
    role: number;    // 0 to 0.20
    recency: number; // 0 to 0.15
    intent: number;  // 0 to 0.05
  };
  summary: string;
};
```

### Confidence

```ts
type Confidence = {
  score: number;   // 0.0 to 1.0 inclusive
  reason?: string; // encouraged, not required
};
```

Optional on `write`, `draft`, and `supersede`. Carried onto `FieldEntry` and onto the corresponding `RECORD` event, unchanged, and surfaced by `read`, `attune`, `reckon`, and `replay`. Never consulted by relevance scoring or conflict detection; it is an input to the reading agent's own decision, not to the protocol's.

**`INVALID_CONFIDENCE` when:**

- `confidence` is not an object, or is `null` or an array.
- `score` is missing, not a number, `NaN`, or outside `[0, 1]` (`Infinity` is caught by the range check).
- `reason` is present and not a string.

### `FieldEvent`

The event shapes appended to a field's durable log, returned by `replay()`. A discriminated union on `type`.

```ts
type FieldEvent = RecordEvent | StatusChangeEvent | RegisterEvent | DeregisterEvent;

type RecordEvent = {
  type: "RECORD";
  v: number;
  event_id: string;
  lamport: number;
  agent: string | null;
  wall_time: number;
  seq: number;
  entry_id: string;
  entry: Record<string, unknown>;
  intent: string;
  confidence?: Confidence;
  supersedes?: string; // set on a supersede's new-entry half
};

type StatusChangeEvent = {
  type: "STATUS_CHANGE";
  // ...same base fields as RecordEvent...
  entry_id: string;
  new_status: FieldEntryStatus;
  intent: string;
};

type RegisterEvent = {
  type: "REGISTER";
  // ...same base fields...
  entry_id: string; // the session / agent id
  role: string;
  capabilities: string[];
};

type DeregisterEvent = {
  type: "DEREGISTER";
  // ...same base fields...
  entry_id: string;
};
```

- `v` is the event format version, currently `1`, independent of the SDK and protocol versions (`EVENT_FORMAT_VERSION`).
- `wall_time` is metadata only. It is never used for ordering; `lamport`, `agent`, and `event_id` are.
- `seq` is adapter-assigned storage position. It is correct for `sinceSeq` windowing and is not an ordering key; two adapters can legitimately assign different `seq` numbering to the same causal history.

### `Projection` and `buildProjection`

```ts
import { buildProjection } from "@akashikprotocol/core";

function buildProjection(events: FieldEvent[]): Projection;

type Projection = {
  entries: Map<string, FieldEntry>;
  sessions: Map<string, { role: string; capabilities: string[] }>;
  upToSeq: number;
  maxLamport: number;
};
```

The derived current-state shape a field maintains internally by applying its event log in total order. `buildProjection` is the same function the field uses, exposed so state-at-a-point composes with `replay()` rather than requiring a separate `stateAt()` method: `buildProjection(await field.replay({ untilSeq: n }))`.

### `StorageAdapter` and `EventScope`

```ts
interface StorageAdapter {
  readonly capabilities?: readonly string[];
  append(events: FieldEvent[]): Promise<{ seqs: number[] }>;
  readEvents(options?: { scope?: EventScope; sinceSeq?: number }): Promise<FieldEvent[]>;
  loadProjection(scope?: EventScope): Promise<Projection | null>;
  saveProjection(projection: Projection, upToSeq: number): Promise<void>;
  init?(): Promise<void>;
  close?(): Promise<void>;
}

type EventScope = {
  topic?: string;
  agent?: string;
};
```

Public for consumers implementing a custom adapter. See [ADAPTERS.md](./docs/ADAPTERS.md) for the two guarantees (atomic batch append, serialized sequence assignment) that are not optional.

### `FIELD_PROTOCOL_LEVELS` and `ProtocolLevel`

```ts
import { FIELD_PROTOCOL_LEVELS } from "@akashikprotocol/core";

const FIELD_PROTOCOL_LEVELS: readonly ["L0", "L1"];
type ProtocolLevel = (typeof FIELD_PROTOCOL_LEVELS)[number];
```

The conformance levels this SDK satisfies, per the Akashik Protocol Specification. Also the value composed into `field_capabilities` on every `register()` call, alongside adapter flags.

---

## Errors

### `AkashikError`

The single error type raised by the SDK. Extends the built-in `Error`.

```ts
class AkashikError extends Error {
  readonly code: AkashikErrorCode;
  readonly details?: Record<string, unknown>;
}

type AkashikErrorCode =
  | "INTENT_REQUIRED"
  | "INTENT_TOO_SHORT"
  | "INVALID_ENTRY"
  | "INVALID_QUERY"
  | "AGENT_REQUIRED"
  | "INVALID_ENVELOPE"
  | "DRAFT_NOT_FOUND"
  | "RETRACT_NOT_AUTHORIZED"
  | "ENTRY_NOT_FOUND"
  | "INVALID_CONFIDENCE"
  | "STORAGE_ERROR";
```

- `code` is a stable string literal; renaming one is a breaking change.
- `details` carries error-specific diagnostic context. Its shape per code is not frozen; treat it as informational, not structural.
- All SDK rejections are `AkashikError` instances.
- `STORAGE_ERROR` is adapter-level: a lock acquisition timeout in `FileAdapter`, or a genuinely corrupt (not merely truncated) event log line. A torn final line from an unclean shutdown is recovered silently, not an error; corruption anywhere earlier throws `STORAGE_ERROR` rather than being dropped.

```ts
import { AkashikError } from "@akashikprotocol/core";

try {
  await field.retract({ id: "xyz", intent: "cleaning up", agent: "other-agent" });
} catch (e) {
  if (e instanceof AkashikError && e.code === "RETRACT_NOT_AUTHORIZED") {
    // handle authorization failure
  }
  throw e;
}
```

---

## Polling with since_epoch

`attune({ since_epoch })` and `reckon({ since_epoch })` turn either method into a subscription built without a transport. Pass the highest `epoch` already seen; only strictly-greater entries return.

```ts
let watermark: number | undefined;

const entries = await field.attune({ agent: "writer", topic: "x", since_epoch: watermark });
for (const entry of entries) watermark = Math.max(watermark ?? -1, entry.epoch);
```

Epoch numbering starts at `0` and `since_epoch` must be non-negative, so there is no watermark value meaning "everything from the start." The first poll should omit `since_epoch` entirely.

`max_units` truncates by relevance, not by epoch. If more entries arrive between polls than `max_units` permits, advancing the watermark to the highest epoch among the returned set skips whatever did not make the cut. Poll frequently enough to stay under `max_units`, or use `replay({ sinceSeq })` for complete, unranked, chronological coverage.

A retraction is never communicated through polling; `attune` surfaces only currently-visible entries, and a retracted entry has nothing to return. See [ATTUNE.md](./docs/ATTUNE.md).

---

## Out of scope for v0.3

Listed here so the absence is deliberate, not accidental. Each maps to a specific conformance level.

- Semantic relevance scoring and vector embeddings, Level 2 (v0.4).
- Automatic conflict detection beyond mechanical key-value comparison, Level 2 (v0.4).
- `MERGE`, push-based `SUBSCRIBE`, and `COMPACT`, Level 2 (v0.4).
- Transport bindings and an authority hierarchy for privileged operations, Level 3 (v0.5).
- Framework adapters (LangChain, CrewAI, Managed Agents), later.
- Python port, later.

---

## Version policy

- `v0.3.x`, patch releases for bugs. No API changes.
- `v0.4.0`, the release that reaches Level 2. All v0.3 code continues to work.
- Breaking changes require a major version bump.
