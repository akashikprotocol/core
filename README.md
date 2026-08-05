# @akashikprotocol/core

The TypeScript SDK for the Akashik Protocol, an open standard for shared memory in multi-agent AI systems.

**Conformance: Level 1 (full).** Every Level 1 requirement in the [Akashik Protocol Specification](https://github.com/akashikprotocol/spec) is implemented and backed by the [adapter conformance suite](./tests/conformance/), run against all three storage backends this SDK ships. The claim is not asserted alone; it is enforced by tests that would fail if any adapter diverged.

## Status

- Protocol spec: <https://github.com/akashikprotocol/spec>
- Conformance level: Level 1 (full)
- SDK version: v0.3.0

## Install

```bash
npm install @akashikprotocol/core
```

The core package has one runtime dependency, `ulid`. Two optional adapters live behind separate subpaths and pull in nothing extra unless you use them.

```bash
# For Postgres-backed fields (pg is an optional peer dependency):
npm install @akashikprotocol/core pg
```

```bash
# For file-backed fields, nothing extra to install:
npm install @akashikprotocol/core
```

`createFileAdapter` uses only `node:fs` and `node:path`. Importing `@akashikprotocol/core/postgres` without `pg` installed throws only when you actually construct a Postgres adapter, never on import of the root package.

## Quick Start

The in-memory path is what most readers try first.

```ts
import { createField } from "@akashikprotocol/core";

const field = createField();

// Agents register with the field, declaring identity and role.
await field.register({
  id: "researcher",
  role: "researcher",
});

await field.register({
  id: "fact-checker",
  role: "researcher",
});

// Agents record observations with mandatory intent.
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

// When a writer needs to act, they reckon with the field.
// Reckon returns relevant entries plus conflicts among them.
const result = await field.reckon({
  agent: "writer",
  topic: "competitor-pricing",
});

console.log(result.entries.length);
// => 2

console.log(result.conflicts);
// => [{ a: <researcher entry>, b: <fact-checker entry>, keys: ["price"] }]
//
// The protocol surfaces the disagreement. The writer decides what to do with it.
```

Persistence is a one-line change. Everything above this line stays identical; only how the field is constructed changes.

```ts
import { createField } from "@akashikprotocol/core";
import { createFileAdapter } from "@akashikprotocol/core/file";

const adapter = createFileAdapter({ path: "./field.jsonl" });
await adapter.init?.();

const field = createField({ adapter });
// write, register, attune, reckon, replay: everything else identical
```

Close the process, start a new one, construct `createField({ adapter: createFileAdapter({ path: "./field.jsonl" }) })` again: the field resumes exactly where it left off. See [`examples/persistence.ts`](./examples/persistence.ts) for the full round trip, including a second field instance reading back what the first one wrote.

## What this SDK provides

The protocol primitives, named with deliberate gravity:

- `register` / `deregister`, agent lifecycle, with capability negotiation
- `write`, record with mandatory intent (immediately committed)
- `draft` / `commit` / `discard`, write with private review before publishing
- `retract`, withdraw a committed entry (author only)
- `supersede`, replace an entry with a newer one (any agent)
- `read`, declarative query of the field state
- `attune`, protocol-decided relevance ranking, with `since_epoch` polling
- `reckon`, attune plus conflict detection
- `replay`, walk the append-only event log, with supersession chain following

Every operation crosses a standard message envelope. Intent is mandatory on every state change.

## What v0.3 adds over v0.2

- Persistent storage behind a `StorageAdapter` interface. A field survives process restart.
- Three adapters ship in this package: `MemoryAdapter` (default, ephemeral), `FileAdapter` (`@akashikprotocol/core/file`), and `PostgresAdapter` (`@akashikprotocol/core/postgres`). All three satisfy the same conformance suite.
- An append-only event log, exposed through `replay()`, with supersession chain following that reconstructs the ordered sequence of intents behind the current state.
- Full Lamport logical clocks, replacing v0.2's monotonic counter, so ordering stays correct when two processes share one field.
- Optional confidence on records: `{ score, reason? }`, carried and surfaced, never used by the protocol to rank or resolve.
- `since_epoch` polling on `attune`, for subscription without a transport.
- Real capability negotiation at registration: the field advertises the conformance levels and adapter-sourced flags it supports.

## What v0.3 does not yet do

- Semantic relevance scoring or vector embeddings (v0.4, Level 2).
- Automatic conflict detection beyond mechanical key-value comparison (v0.4, Level 2).
- `MERGE`, push-based `SUBSCRIBE`, or `COMPACT` (v0.4, Level 2).
- Transport bindings or an authority hierarchy for privileged operations (v0.5, Level 3).

Each absence maps to a specific conformance level and arrives with the release that reaches it. See [roadmap.md](./specs/roadmap.md).

## Documentation

- [ATTUNE](./docs/ATTUNE.md), relevance scoring and polling deep-dive
- [RECKON](./docs/RECKON.md), conflict detection deep-dive
- [REPLAY](./docs/REPLAY.md), event log, chain following, and time travel by composition
- [ADAPTERS](./docs/ADAPTERS.md), choosing, configuring, and implementing storage adapters
- Spec: <https://github.com/akashikprotocol/spec>

## Project documents

- [GOVERNANCE](./GOVERNANCE.md), who decides what, and how contributions flow
- [PRINCIPLES](./PRINCIPLES.md), the design constitution all changes hold to
- [CONTRIBUTING](./CONTRIBUTING.md), local development and the dev workflow
- [CHANGELOG](./CHANGELOG.md), notable changes per release
- [API](./API.md), the complete public surface of the SDK
- [LICENSE](./LICENSE), Apache 2.0

## Specs

- [Mission](./specs/mission.md), what the project is for and who it serves
- [Tech stack](./specs/tech-stack.md), the technical choices and their reasoning
- [Roadmap](./specs/roadmap.md), planned releases mapped to conformance levels

## Design philosophy

Three rules the protocol obeys:

1. **The protocol decides relevance and detects disagreement; the agent decides resolution.** Akashik surfaces; the agent chooses what to do.
2. **Intent is mandatory.** Every state-changing operation requires a non-trivial intent string. The protocol thesis is that intent makes multi-agent state legible.
3. **Mechanical now, semantic later.** v0.3 detects conflicts mechanically and orders events with Lamport clocks, not embeddings or wall-clock trust. v0.4 adds semantic conflict reasoning. Each layer is shipped when it can be done honestly.

## Examples

```bash
npm run example              # two-agents.ts, the v0.1 canonical example
npm run example:conflict     # conflict.ts, the v0.2 canonical example
npm run example:coding       # coding-agents.ts, multi-phase collaboration
npm run example:showcase     # protocol-showcase.ts, every v0.2 capability
npm run example:replay       # replay.ts, supersession chain reconstruction
npm run example:persistence  # persistence.ts, the v0.3 canonical example: a field that survives a restart
npm run example:postgres     # postgres.ts, the same, backed by Postgres (needs AKASHIK_TEST_POSTGRES)
```

## License

Apache 2.0.

## Contributing

Issues and discussion at <https://github.com/akashikprotocol/core>.
