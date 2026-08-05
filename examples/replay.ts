/**
 * examples/replay.ts
 *
 * The v0.3 REPLAY example.
 * An entry is superseded twice, building a three-link chain. replay() walks
 * the chain and returns the ordered sequence of intents that produced the
 * current state — the reasoning, not just the result.
 *
 * Run: npx tsx examples/replay.ts
 *      npm run example:replay
 */

/// <reference types="node" />

import { createField } from "../src/index.js";

async function main() {
  const field = createField();

  // 1. Researcher records an initial pricing observation.
  const { id: originalId } = await field.write({
    entry: { topic: "pricing", price: "$29" },
    intent: "initial pricing observation from the g2 listing",
    agent: "researcher",
  });

  // 2. Fact-checker supersedes it after checking the source directly.
  await field.supersede({
    superseding_id: originalId,
    entry: { topic: "pricing", price: "$39" },
    intent: "correcting the price after a direct source check",
    agent: "fact-checker",
  });

  // 3. Strategist supersedes again after the vendor changed published pricing.
  //    Chain resolution walks to the current latest entry regardless of
  //    which id in the chain is targeted — both supersede calls here
  //    reference originalId, but the second one lands on the first
  //    correction, not on the original.
  await field.supersede({
    superseding_id: originalId,
    entry: { topic: "pricing", price: "$49" },
    intent: "updating again after the vendor changed published pricing",
    agent: "strategist",
  });

  // 4. replay(entry_id) walks the full chain — every entry that led here,
  //    in order, each with the intent that produced it.
  console.log("\n— replay({ entry_id: originalId }) — the reasoning chain —");
  const chain = await field.replay({ entry_id: originalId });
  for (const event of chain) {
    if (event.type === "RECORD" || event.type === "STATUS_CHANGE") {
      console.log(`  [${event.type}] ${event.agent}: ${event.intent}`);
    }
  }

  // 5. followChain: false — only the literal entry's own events, no chain walk.
  console.log("\n— replay({ entry_id: originalId, followChain: false }) —");
  const literal = await field.replay({ entry_id: originalId, followChain: false });
  for (const event of literal) {
    console.log(`  [${event.type}] ${event.agent}: ${event.intent}`);
  }

  // The current state shows only the strategist's $49 entry.
  // The replay shows why: three agents, three checks, one chain.
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
