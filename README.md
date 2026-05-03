# @akashikprotocol/core

The reference SDK for the **Akashik Protocol** — shared memory and coordination for multi-agent AI systems.

AI agents today are brilliant individuals with amnesia. They can't see what other agents are doing, can't remember what they decided yesterday, and have no shared sense of what the work is for.

Akashik is an open protocol for fixing that. Persistent shared state. Mandatory intent on every write. Attunement over search.

Where **MCP** defines how an agent reaches for tools, and **A2A** defines how agents talk to each other, **Akashik** defines what they share, how they stay coordinated, and how they reason about each other's context.

---

## Install

```bash
npm install @akashikprotocol/core
```

## Quick start

```ts
import { createField } from "@akashikprotocol/core";

const field = createField();

// A research agent logs a finding, with intent.
await field.write({
  entry: { topic: "competitor-pricing", source: "crunchbase", value: "$49/mo" },
  intent: "gathering market signal for pricing recommendation",
  agent: "researcher",
});

// A second agent logs a constraint it discovered, also with intent.
await field.write({
  entry: { topic: "competitor-pricing", note: "enterprise tier gated, unverified" },
  intent: "flagging data quality before the writer uses it",
  agent: "fact-checker",
});

// A writer agent attunes to the field — no query string, no search.
const relevant = await field.attune({ agent: "writer", topic: "competitor-pricing" });

// → Both entries, surfaced with their intents, so the writer
//   can reason about *why* the field looks the way it does
//   before it puts a single word on the page.
```

That's the whole thesis in a handful of lines. Every write carries intent. `attune()` replaces search with relevance. Multiple agents share one field.

Full runnable example: [`examples/two-agents.ts`](./examples/two-agents.ts).

Deep-dive on attunement: [`docs/ATTUNE.md`](./docs/ATTUNE.md).

---

## What's in v0.1

- `write({ entry, intent })` — mandatory intent, enforced at the type level and at runtime.
- `read(query)` — retrieve entries from the field.
- `attune(context)` — surface what's relevant to an agent right now.
- TypeScript-first, full types exported.
- In-memory backend. Zero runtime dependencies beyond `ulid`.

Persistent storage, framework adapters, and a Python port are on the roadmap.

---

## Learn more

- **Website:** [akashikprotocol.com](https://akashikprotocol.com)
- **Specification:** [github.com/akashikprotocol/spec](https://github.com/akashikprotocol/spec)
- **Org:** [github.com/akashikprotocol](https://github.com/akashikprotocol)

## License

Apache-2.0