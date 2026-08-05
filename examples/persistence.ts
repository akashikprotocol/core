/**
 * examples/persistence.ts
 *
 * The v0.3 canonical example.
 * Two agents disagree on a topic. reckon() surfaces the conflict. The field
 * closes. A brand new field, constructed fresh over the same file, resumes
 * with everything intact: entries, intents, confidence, epochs. That moment,
 * step 5 below, is what persistence actually means, not a promise but an
 * observable fact about a second field that never shared memory with the
 * first one, only a file.
 *
 * Uses FileAdapter, so this runs standalone with no external service.
 *
 * Run: npx tsx examples/persistence.ts
 *      npm run example:persistence
 */

/// <reference types="node" />

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createFileAdapter } from "../src/file.js";
import { createField } from "../src/index.js";

async function main() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "akashik-persistence-"));
  const logPath = path.join(dir, "field.jsonl");

  // 1. First field: register two agents.
  console.log(`\n-- field 1 -- a fresh field at ${logPath} --`);
  const adapter1 = createFileAdapter({ path: logPath });
  await adapter1.init?.();
  const field1 = createField({ adapter: adapter1 });

  await field1.register({ id: "researcher", role: "researcher" });
  await field1.register({ id: "fact-checker", role: "researcher" });

  // 2. Conflicting observations on one topic.
  const { id: originalId } = await field1.write({
    entry: { topic: "pricing", price: "$29" },
    intent: "initial pricing observation from the g2 listing",
    agent: "researcher",
    confidence: { score: 0.6, reason: "single source, not yet verified" },
  });
  await field1.write({
    entry: { topic: "pricing", price: "$39" },
    intent: "correcting the price after a direct source check",
    agent: "fact-checker",
    confidence: { score: 0.95, reason: "verified directly with the vendor" },
  });
  console.log("  wrote 2 conflicting observations on topic 'pricing'");

  // 3. reckon surfaces the conflict.
  const reckoned = await field1.reckon({ agent: "writer", topic: "pricing" });
  console.log(`  reckon() found ${reckoned.conflicts.length} conflict(s):`);
  for (const conflict of reckoned.conflicts) {
    console.log(
      `    ${conflict.a.agent} vs ${conflict.b.agent} disagree on: [${conflict.keys.join(", ")}]`,
    );
  }

  // Extend the chain once more before closing, so replay() below has
  // something worth walking.
  const { id: latestId } = await field1.supersede({
    superseding_id: originalId,
    entry: { topic: "pricing", price: "$45" },
    intent: "settling on a mid-range estimate pending final vendor confirmation",
    agent: "researcher",
  });

  // 4. Close the field. Nothing below this line shares memory with anything above it.
  await adapter1.close?.();
  console.log("  closed field 1's connection to the file");

  // 5. A brand new field, constructed fresh over the same path.
  console.log("\n-- field 2 -- a new Field instance, the same file --");
  const adapter2 = createFileAdapter({ path: logPath });
  const field2 = createField({ adapter: adapter2 });

  // 6. State is intact: entries, intents, confidence, epochs.
  const all = await field2.read();
  console.log(`  read() sees ${all.length} entries:`);
  for (const entry of all) {
    const confidenceNote = entry.confidence ? ` (confidence: ${entry.confidence.score})` : "";
    console.log(
      `    epoch=${entry.epoch} status=${entry.status} [${entry.agent}] "${entry.intent}"${confidenceNote}`,
    );
  }

  // 7. replay() shows the reasoning chain behind the current price.
  console.log("\n-- field 2 -- replay({ entry_id: originalId }) -- the reasoning chain --");
  const chain = await field2.replay({ entry_id: originalId });
  for (const event of chain) {
    if (event.type === "RECORD" || event.type === "STATUS_CHANGE") {
      console.log(`    [${event.type}] ${event.agent}: "${event.intent}"`);
    }
  }

  // 8. One more write, then poll with since_epoch to see only what's new.
  const beforeWatermark = (await field2.read()).reduce((max, e) => Math.max(max, e.epoch), -1);
  await field2.write({
    entry: { topic: "pricing", price: "$45", region: "eu" },
    intent: "adding a regional price point alongside the settled estimate",
    agent: "fact-checker",
  });

  const polled = await field2.attune({
    agent: "writer",
    topic: "pricing",
    since_epoch: beforeWatermark,
  });
  console.log(`\n-- field 2 -- attune({ since_epoch: ${beforeWatermark} }) --`);
  console.log(
    `  ${polled.length} new entr${polled.length === 1 ? "y" : "ies"} since the watermark:`,
  );
  for (const entry of polled) {
    console.log(`    [${entry.agent}] "${entry.intent}"`);
  }

  await adapter2.close?.();
  console.log(`\nField state lives at ${logPath} for inspection.`);
  console.log(`(latest entry before this run's final write: ${latestId})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
