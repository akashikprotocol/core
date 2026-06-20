# @akashikprotocol/core

The TypeScript SDK for the Akashik Protocol — an open standard for shared memory in multi-agent AI systems.

This package is the Level 0 reference implementation of the Akashik Protocol Specification. v0.2 reaches full Level 0 conformance with selected Level 1 operations.

## Status

- Protocol spec: <https://github.com/akashikprotocol/spec>
- Conformance level: Level 0 + selected Level 1 (DEREGISTER, RETRACT, SUPERSEDE, DETECT in list mode via reckon)
- SDK version: v0.2.0

## Install

```bash
npm install @akashikprotocol/core
```

## Quick Start

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

## What this SDK provides

The protocol primitives, named with deliberate gravity:

- `register` / `deregister` — agent lifecycle
- `write` — record with mandatory intent (immediately committed)
- `draft` / `commit` / `discard` — write with private review before publishing
- `retract` — withdraw a committed entry (author only)
- `supersede` — replace an entry with a newer one (any agent)
- `read` — declarative query of the field state
- `attune` — protocol-decided relevance ranking
- `reckon` — attune plus conflict detection

Every operation crosses a standard message envelope. Intent is mandatory on every state change.

## What v0.2 adds over v0.1

- Standard message envelope
- REGISTER and DEREGISTER with capability exchange
- Relevance scoring with topic, role, recency, and intent quality components
- max_units truncation; role parameter
- Draft mode (private scratchpad before committing to the shared field)
- Retract (author-only, idempotent)
- Supersede with chain extension (any agent)
- Reckon — conflict detection on mechanical key-value mismatch

## What v0.2 does not yet do

- Persistent storage (v0.3)
- Event log / REPLAY (v0.3)
- Full Lamport logical clocks (v0.3 — v0.2 uses a monotonic counter)
- Confidence on RECORD (v0.3)
- Vector embeddings or semantic relevance (v0.4, Level 2)
- Transport bindings (v0.5, Level 3)

## Documentation

- [ATTUNE](./docs/ATTUNE.md) — relevance scoring deep-dive
- [RECKON](./docs/RECKON.md) — conflict detection deep-dive
- Spec: <https://github.com/akashikprotocol/spec>

## Project documents

- [GOVERNANCE](./GOVERNANCE.md) ~ who decides what, and how contributions flow
- [PRINCIPLES](./PRINCIPLES.md) ~ the design constitution all changes hold to
- [CONTRIBUTING](./CONTRIBUTING.md) ~ local development and the dev workflow
- [CHANGELOG](./CHANGELOG.md) ~ notable changes per release
- [API](./API.md) ~ the complete public surface of the SDK
- [LICENSE](./LICENSE) ~ Apache 2.0

## Specs

- [Mission](./specs/mission.md) ~ what the project is for and who it serves
- [Tech stack](./specs/tech-stack.md) ~ the technical choices and their reasoning
- [Roadmap](./specs/roadmap.md) ~ planned releases mapped to conformance levels

## Design philosophy

Three rules the protocol obeys:

1. **The protocol decides relevance and detects disagreement; the agent decides resolution.** Akashik surfaces; the agent chooses what to do.
2. **Intent is mandatory.** Every state-changing operation requires a non-trivial intent string. The protocol thesis is that intent makes multi-agent state legible.
3. **Mechanical now, semantic later.** v0.2 detects conflicts mechanically. v0.4 adds semantic conflict reasoning. Each layer is shipped when it can be done honestly.

## Examples

```bash
npm run example           # two-agents.ts — the v0.1 canonical example
npm run example:conflict  # conflict.ts — the v0.2 canonical example
npm run example:coding    # coding-agents.ts — multi-phase collaboration
npm run example:showcase  # protocol-showcase.ts — every capability
```

## License

Apache 2.0.

## Contributing

Issues and discussion at <https://github.com/akashikprotocol/core>.
