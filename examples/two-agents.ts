/**
 * examples/two-agents.ts
 *
 * The canonical Akashik Protocol example.
 * Three agents share a Field. Each write carries intent.
 * Reading is declarative. Attunement replaces search with relevance.
 *
 * Run: npx tsx examples/two-agents.ts
 */

import { createField } from "@akashikprotocol/core";

async function main() {
  const field = createField();

  // A research agent logs a finding, with intent.
  await field.write({
    entry: { topic: "competitor-pricing", source: "crunchbase", value: "$49/mo" },
    intent: "gathering market signal for pricing recommendation",
    agent: "researcher",
  });

  // A second agent flags a quality concern, with its own intent.
  await field.write({
    entry: {
      topic: "competitor-pricing",
      note: "enterprise tier gated, unverified",
    },
    intent: "flagging data quality before the writer uses it",
    agent: "fact-checker",
  });

  // ─────────────────────────────────────────────────────────────────────
  // read() — declarative query.
  // Show every entry on the topic, regardless of who wrote it.
  // ─────────────────────────────────────────────────────────────────────
  console.log("\n— read({ topic: 'competitor-pricing' }) —");
  const all = await field.read({ topic: "competitor-pricing" });
  for (const entry of all) {
    console.log(`  [${entry.agent ?? "anonymous"}] ${entry.intent}`);
  }

  // ─────────────────────────────────────────────────────────────────────
  // attune() — opinionated relevance from a specific agent's view.
  // The writer attunes; the field excludes the writer's own entries
  // (none yet) and surfaces what's relevant to consider.
  // ─────────────────────────────────────────────────────────────────────
  console.log("\n— attune({ agent: 'writer', topic: 'competitor-pricing' }) —");
  const relevant = await field.attune({
    agent: "writer",
    topic: "competitor-pricing",
  });
  for (const entry of relevant) {
    console.log(`  [${entry.agent}] ${entry.intent}`);
  }

  // The writer can now reason about *why* each entry exists —
  // not just what's there, but the intent behind it —
  // before writing a single word.
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
