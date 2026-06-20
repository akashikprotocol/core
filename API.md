# API — `@akashikprotocol/core` v0.2

This document is the complete public surface of the v0.2 SDK. Every function, argument, return shape, and error listed here is part of the contract. Nothing outside this document is public API.

All v0.1 code continues to work without changes. The new methods are strictly additive.

---

## Design principles

1. **Intent is mandatory on every write.** Not a convention — enforced at runtime with a typed error.
2. **The protocol decides relevance, not the caller.** `attune()` is opinionated by design.
3. **Declarative over imperative.** Queries describe *what* the caller wants, not *how* to fetch it.
4. **Conflict surfacing, not conflict resolution.** The protocol detects disagreement and hands it back. Resolution is always the agent's job.

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

---

## Entry point

### `createField(options?)`

Creates a new Field — the shared memory surface agents read from and write to.

```ts
function createField(options?: FieldOptions): Field;

type FieldOptions = {
  /** Minimum length for the intent string, after trimming. Default: 10. */
  minIntentLength?: number;
};
```

- `minIntentLength` defaults to `10`. Setting it to `0` is legal but logs a console warning on first write.
- A Field is an in-memory store. All methods return Promises; the async signature is stable for future storage adapters.

---

## Methods on `Field`

### `field.write({ entry, intent, agent? })`

Writes a committed entry to the Field, tagged with the agent's intent.

```ts
write(input: WriteInput): Promise<WriteResult>;

type WriteInput = {
  entry: Record<string, unknown>;
  intent: string;
  agent?: string;
};

type WriteResult = {
  id: string;       // ULID
  timestamp: number; // Unix milliseconds
};
```

- `entry` is a plain object. Any JSON-serialisable shape is accepted.
- `intent` must be at least `minIntentLength` characters after trimming.
- `agent` is optional but strongly recommended — it drives `attune()` filtering, conflict detection, and `retract()` authorization.
- The written entry gets `status: "committed"` and an `epoch` counter value.

**Rejects with**

| Code | When |
|------|------|
| `INTENT_REQUIRED` | `intent` is missing, null, or undefined |
| `INTENT_TOO_SHORT` | `intent.trim().length < minIntentLength` |
| `INVALID_ENTRY` | `entry` is not a plain object |

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

`relevance_score` is a float in [0, 1]. `relevance_reason` breaks down each component's contribution.

**Parameters**

- `topic` — Filters to entries with matching `entry.topic` AND adds full topic weight to their score. Omit to scan the full field.
- `role` — Explicit role for role-match scoring. Falls back to the agent's registered session role.
- `max_units` — Cap on returned entries. Entries beyond the cap (lowest relevance first) are dropped. Default `100`. Negative values throw `INVALID_QUERY`.

**Rejects with**

| Code | When |
|------|------|
| `AGENT_REQUIRED` | `agent` is missing or empty |
| `INVALID_QUERY` | `max_units` is negative |

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
3. Values at that shared key differ AND both values are primitive (`string`, `number`, `boolean`, or `null`).

Object-valued keys do not produce conflicts in v0.2. Each conflicting pair appears once (`a` vs `b`, not `b` vs `a`). Pairs are sorted by the timestamp of the newer entry, ascending.

Use `reckon` when the calling agent needs to know about disagreement before deciding how to act. Use `attune` when you want the scored surface without conflict commentary.

**Rejects with**

| Code | When |
|------|------|
| `AGENT_REQUIRED` | `agent` is missing or empty |
| `INVALID_QUERY` | `max_units` is negative |

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
- `capabilities` is advisory — agents declare what they can do; the Field records it but does not enforce it in v0.2.
- Re-registering the same `id` replaces the existing session.
- `field_protocol_version` is always `"0.2"` for this release.

**Rejects with**

| Code | When |
|------|------|
| `INVALID_ENVELOPE` | `id` or `role` is missing or not a string |

---

### `field.deregister({ id })`

Removes an agent's session from the Field.

```ts
deregister(input: { id: string }): Promise<void>;
```

- Idempotent — deregistering an unknown `id` succeeds silently.
- Does not affect entries the agent has written; they remain in the Field.

---

### `field.draft({ entry, intent, agent? })`

Creates a draft entry — visible only to its author until committed.

```ts
draft(input: DraftInput): Promise<{ draft_id: string }>;

type DraftInput = {
  entry: Record<string, unknown>;
  intent: string;
  agent?: string;
};
```

- Draft entries have `status: "draft"` and do not appear in other agents' `attune()` or `reckon()` results.
- The author sees their own drafts via `attune()`, `reckon()`, and `read({ caller: agent })`.
- `draft_id` is a ULID and is stable through `commit()`.

**Rejects with**

| Code | When |
|------|------|
| `INTENT_REQUIRED` | `intent` is missing, null, or undefined |
| `INTENT_TOO_SHORT` | `intent.trim().length < minIntentLength` |
| `INVALID_ENTRY` | `entry` is not a plain object |

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

Discards a draft without committing it. The draft is removed from the Field entirely.

```ts
discard(input: DiscardInput): Promise<void>;

type DiscardInput = {
  draft_id: string;
  intent: string;
  agent?: string;
};
```

- `intent` is required on discard — the reason for discarding is itself a signal.

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
- `intent` is required — the reason for retraction is part of the record.

**Rejects with**

| Code | When |
|------|------|
| `ENTRY_NOT_FOUND` | No entry with `id` exists |
| `RETRACT_NOT_AUTHORIZED` | Calling `agent` does not match the entry's author |
| `INTENT_REQUIRED` | `intent` is missing, null, or undefined |
| `INTENT_TOO_SHORT` | `intent.trim().length < minIntentLength` |

---

### `field.supersede({ superseding_id, entry, intent, agent })`

Creates a new entry that replaces a previous one. The predecessor is marked `"superseded"` and disappears from `attune()` and `reckon()`.

```ts
supersede(input: SupersedeInput): Promise<SupersedeResult>;

type SupersedeInput = {
  superseding_id: string;  // id of the entry being replaced
  entry: Record<string, unknown>;
  intent: string;
  agent: string;
};

type SupersedeResult = {
  id: string;       // new entry's ULID
  epoch: number;
  timestamp: number;
};
```

- Any agent may supersede any committed entry (authorization is not enforced in v0.2).
- Retracted entries cannot be superseded — retract is final.
- If the predecessor has already been superseded, `supersede()` follows the chain to the latest entry and uses that as the actual predecessor. The chain always resolves to the newest version.
- The new entry has `status: "committed"` immediately.

**Rejects with**

| Code | When |
|------|------|
| `ENTRY_NOT_FOUND` | No entry with `superseding_id` exists |
| `INVALID_ENTRY` | `entry` is not a plain object |
| `INTENT_REQUIRED` | `intent` is missing, null, or undefined |
| `INTENT_TOO_SHORT` | `intent.trim().length < minIntentLength` |
| `AGENT_REQUIRED` | `agent` is missing or empty |

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
};

type FieldEntryStatus = "committed" | "draft" | "retracted" | "superseded";
```

- `epoch` is a field-wide monotonic counter. Higher epoch = written later.
- `status` reflects the entry's lifecycle state.

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
  | "ENTRY_NOT_FOUND";
```

- `code` is a stable string literal — renaming one is a breaking change.
- `details` carries error-specific diagnostic context. Its shape per code is not frozen; treat it as informational, not structural.
- All SDK rejections are `AkashikError` instances.

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

## Out of scope for v0.2

Listed here so the absence is deliberate, not accidental.

- Persistent storage adapters (Postgres, Redis, S3) — v0.3+.
- Conflict resolution — the protocol surfaces disagreement; resolution is always the caller's job.
- Deep object-value comparison for conflict detection — v0.4+.
- Framework adapters (LangChain, CrewAI, Managed Agents) — later.
- Python port — later.

---

## Version policy

- `v0.2.x` — patch releases for bugs. No API changes.
- `v0.3.0` — first version to extend beyond in-memory. All v0.2 code continues to work.
- Breaking changes require a major version bump.
