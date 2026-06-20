/**
 * examples/conflict.ts
 *
 * The v0.2 canonical example.
 * Two agents record observations on the same topic with conflicting facts.
 * A writer attunes (relevance-sorted, no conflict commentary), then reckons
 * (same entries plus the conflict between them).
 *
 * Run: npx tsx examples/conflict.ts
 *      npm run example:conflict
 */

/// <reference types="node" />

import { createField } from "../src/index.js";

async function main() {
  const field = createField();

  // 1. Agents register with role declarations.
  await field.register({ id: "researcher", role: "researcher" });
  await field.register({ id: "fact-checker", role: "researcher" });
  await field.register({ id: "writer", role: "writer" });

  // 2. Researcher records initial observation.
  await field.write({
    entry: { topic: "competitor-pricing", source: "g2", price: "$49/mo" },
    intent: "documenting competitor per-seat pricing observed on g2",
    agent: "researcher",
  });

  // 3. Fact-checker records a contradiction.
  await field.write({
    entry: { topic: "competitor-pricing", source: "competitor-site", price: "$39/mo" },
    intent: "fact-checker correction after verifying directly with the source",
    agent: "fact-checker",
  });

  // 4. Writer attunes — sees both entries, sorted by relevance.
  //    attune returns scored entries, no conflict commentary.
  console.log("\n— attune({ agent: 'writer', topic: 'competitor-pricing' }) —");
  const attuneResult = await field.attune({
    agent: "writer",
    topic: "competitor-pricing",
  });
  for (const entry of attuneResult) {
    console.log(`  [${entry.agent}] score=${entry.relevance_score.toFixed(2)}: ${entry.intent}`);
  }

  // 5. Writer reckons — same entries plus the conflicts among them.
  //    reckon is the call to make when disagreement matters before acting.
  console.log("\n— reckon({ agent: 'writer', topic: 'competitor-pricing' }) —");
  const reckonResult = await field.reckon({
    agent: "writer",
    topic: "competitor-pricing",
  });
  for (const entry of reckonResult.entries) {
    console.log(`  [${entry.agent}] score=${entry.relevance_score.toFixed(2)}: ${entry.intent}`);
  }

  console.log("\n  Conflicts:");
  if (reckonResult.conflicts.length === 0) {
    console.log("  (none)");
  }
  for (const conflict of reckonResult.conflicts) {
    console.log(
      `    ${conflict.a.agent} vs ${conflict.b.agent} disagree on: [${conflict.keys.join(", ")}]`,
    );
    console.log(`      ${conflict.a.agent}: ${JSON.stringify(conflict.a.entry)}`);
    console.log(`      ${conflict.b.agent}: ${JSON.stringify(conflict.b.entry)}`);
  }

  // The protocol surfaced the disagreement.
  // The writer now decides: escalate, pick a source, hold both as a range.

  await field.deregister({ id: "researcher" });
  await field.deregister({ id: "fact-checker" });
  await field.deregister({ id: "writer" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
