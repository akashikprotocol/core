# API - `@akashikprotocol/core` v0.1

Status: **Frozen for v0.1.** Any change to this document between now and the 29 April 2026 release requires a version bump decision.

This document describes the public surface of the v0.1 SDK. Every function, every argument, every return shape, every error listed here is part of the contract. Nothing outside this document is public API.

---

## Design principles

Three rules the API obeys. If a future addition violates one of these, it doesn't ship in v0.1.

1. **Intent is mandatory on every write.** Not a convention, not a recommendation — enforced at runtime with a typed error.
2. **The protocol decides relevance, not the caller.** `attune()` is opinionated by design.
3. **Declarative over imperative.** Queries describe *what* the caller wants, not *how* to fetch it. This is what lets v0.2 add persistent storage adapters without breaking v0.1 code.

---

## Minimum viable usage

The full v0.1 surface, exercised end-to-end.

```ts
import { createField } from "@akashikprotocol/core";

const field = createField();

await field.write({
  entry: { topic: "pricing", value: "$49/mo" },
  intent: "proposing launch price based on competitor research",
  agent: "researcher",
});

const entries = await field.read({ topic: "pricing" });
// → [{ id, timestamp, entry, intent, agent }]

const relevant = await field.attune({ agent: "writer", topic: "pricing" });
// → entries about pricing, authored by agents other than 'writer'
```

Three calls. Mandatory intent. Declarative read. Opinionated attune. That's v0.1.

---

## Entry point

### `createField(options?)`

Creates a new Field — the shared memory surface that agents read from and write to.

```ts
function createField(options?: FieldOptions): Field;

type FieldOptions = {
  /** Minimum length for the intent string. Default: 10. */
  minIntentLength?: number;
};
```

**Notes**

- `minIntentLength` defaults to 10. Lower values weaken the protocol's thesis; they exist for testing and niche telemetry use cases.
- Setting `minIntentLength: 0` is legal but logs a console warning on first write. Opting out of the protocol's core guarantee is a deliberate act.
- A Field is an in-memory store in v0.1. Persistent storage adapters arrive in v0.2 without changing this entry point's signature.

---

## Methods on `Field`

All methods return Promises. The in-memory backend resolves synchronously-fast, but the async signature is stable for v0.2+ storage adapters.

### `field.write({ entry, intent })`

Writes an entry to the Field, tagged with the agent's intent.

```ts
write(input: WriteInput): Promise<WriteResult>;

type WriteInput = {
  entry: Record<string, unknown>;
  intent: string;
  agent?: string;
};

type WriteResult = {
  id: string;
  timestamp: number;
};
```

**Contract**

- `entry` is a plain object. Any JSON-serialisable shape is accepted in v0.1. Schema validation is not enforced — the protocol is content-agnostic.
- `intent` must be a string of at least `minIntentLength` characters (default 10) after trimming whitespace. This is enforced at runtime.
- `agent` is optional in v0.1 but recommended. It becomes significant in v0.2 for conflict detection and in `attune()` filtering.
- Returns `{ id, timestamp }`. `id` is a ULID; `timestamp` is Unix milliseconds.

**Rejects with**

- `AkashikError` with `code: "INTENT_REQUIRED"` — if `intent` is missing, null, or undefined.
- `AkashikError` with `code: "INTENT_TOO_SHORT"` — if `intent.trim().length < minIntentLength`.
- `AkashikError` with `code: "INVALID_ENTRY"` — if `entry` is not a plain object.

---

### `field.read(query?)`

Retrieves entries from the Field that match a query.

```ts
read(query?: ReadQuery): Promise<FieldEntry[]>;

type ReadQuery = Record<string, unknown>;
```

**Contract**

- `read()` with no argument (or an empty object) returns all entries.
- `read(query)` returns entries where every key in `query` matches the same key in `entry`. Equality is `===` for primitive values. For object values, v0.1 performs shallow key-value comparison using `===` on each value. Deep matching lands in v0.2.
- Results are returned in write order (oldest first).
- The caller receives the full `FieldEntry`, including `intent`. Intent is not write-side only; readers must be able to reason about *why* each entry exists.

**Rejects with**

- `AkashikError` with `code: "INVALID_QUERY"` — if `query` is neither undefined nor a plain object.

---

### `field.attune({ agent, topic? })`

Surfaces what's relevant to an agent right now. Not a query. Not a search. An opinionated answer from the protocol about which entries the agent should be paying attention to.

```ts
attune(context: AttuneContext): Promise<FieldEntry[]>;

type AttuneContext = {
  agent: string;
  topic?: string;
};
```

**Contract**

- `agent` is required. Attunement is always from *some* agent's perspective.
- `topic` is optional. When present, it narrows the field to entries whose `entry.topic === topic`.
- In v0.1, relevance is defined as: *entries not authored by the calling agent, matching the topic filter if supplied, in write order*. This definition will deepen in v0.2+ — with recency weighting, intent clustering, and conflict surfacing — without changing the method signature.
- Entries written without an `agent` field are treated as "not authored by the calling agent" and will appear in attunement results. If an agent wants its own writes excluded from its own attunements, it must supply `agent` on write. This is a deliberate v0.1 choice — requiring `agent` on writes later is non-breaking; enforcing it now is not.
- This is the method that distinguishes Akashik from a memory store. Callers who want raw access use `read()`. Callers who want to know *what to think about next* use `attune()`.

**Example**

```ts
// A researcher logs a finding, tagged with its agent id.
await field.write({
  entry: { topic: "competitor-pricing", value: "$49/mo" },
  intent: "gathering market signal for pricing recommendation",
  agent: "researcher",
});

// The writer attunes to pricing context \u2014 no query, no keywords.
// The field returns what the writer should be paying attention to.
const context = await field.attune({ agent: "writer", topic: "competitor-pricing" });
// → the researcher's entry, with its intent intact,
//   so the writer can reason about *why* that value is there
//   before putting a word on the page.
```

**Rejects with**

- `AkashikError` with `code: "AGENT_REQUIRED"` — if `agent` is missing or empty.

---

## Types

### `FieldEntry`

The canonical shape returned by `read()` and `attune()`. Every entry in the field carries its intent and provenance — not as a convenience, as a contract.

```ts
type FieldEntry = {
  id: string;
  timestamp: number;
  entry: Record<string, unknown>;
  intent: string;
  agent?: string;
};
```

**Why the wrapper**

Intent is not write-side only. A reader that receives `entry` without `intent` cannot distinguish a proposal from a constraint, a finding from a guess, a decision from a note. The wrapper guarantees every reader has the same context the writer had.

---

## Errors

### `AkashikError`

The single error type raised by the SDK. Extends the built-in `Error`. All SDK failures are catchable with one `instanceof` check.

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
  | "AGENT_REQUIRED";
```

**Contract**

- `code` is a stable string literal. These codes are part of the public API — renaming one is a breaking change.
- `details` carries error-specific context (for example, the minimum length that was violated). Its shape per code is not frozen in v0.1; callers should treat it as diagnostic, not structural.
- All SDK rejections are `AkashikError` instances. If a caller catches something that isn't an `AkashikError`, it's a bug in the SDK, not a protocol violation.

**Pattern**

```ts
import { AkashikError } from "@akashikprotocol/core";

try {
  await field.write({ entry: { topic: "x" }, intent: "too short" });
} catch (e) {
  if (e instanceof AkashikError && e.code === "INTENT_TOO_SHORT") {
    // handle the protocol violation specifically
  }
  throw e;
}
```

---

## Out of scope for v0.1

Listed here so the absence is deliberate, not accidental. None of these are in the public API until their version lands.

- Persistent storage adapters (Postgres, Redis, S3) — v0.2.
- Conflict detection between writes on the same topic with incompatible intents — v0.2.
- Framework adapters (LangChain, CrewAI, Managed Agents) — v0.3.
- Python port — later.
- CLI and devtools — later.

---

## Version policy

- `v0.1.x` — patch releases for bugs. No API changes.
- `v0.2.0` — first version to extend the API. All v0.1 code continues to work.
- Breaking changes require a major version bump. Nothing in this document changes shape without that.