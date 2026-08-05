/**
 * examples/postgres.ts
 *
 * The v0.3 PostgresAdapter example.
 * Unlike every other example, this one needs a live database — persistence
 * cannot be demonstrated without something to persist to. A first field
 * writes two entries with confidence and closes its connection. A second
 * field, constructed fresh over the same connection string and field id,
 * reads them back and replays the log — proving state survived past the
 * first field's process, not just past the first field's memory.
 *
 * Requires the optional peer dependency `pg` and a reachable Postgres
 * instance. Set AKASHIK_TEST_POSTGRES to a connection string to run it —
 * the same variable the Postgres conformance suite uses.
 *
 * Run: AKASHIK_TEST_POSTGRES=postgresql://user:pass@host:5432/db npx tsx examples/postgres.ts
 *      AKASHIK_TEST_POSTGRES=postgresql://user:pass@host:5432/db npm run example:postgres
 */

/// <reference types="node" />

import { createField } from "../src/index.js";
import { createPostgresAdapter } from "../src/postgres.js";

async function main() {
  const connectionString = process.env.AKASHIK_TEST_POSTGRES;
  if (connectionString === undefined) {
    console.log(
      "Set AKASHIK_TEST_POSTGRES to a Postgres connection string to run this example.\n" +
        "  e.g. AKASHIK_TEST_POSTGRES=postgresql://user:pass@localhost:5432/akashik_test " +
        "npm run example:postgres",
    );
    return;
  }

  // A fresh field id per run, so repeated runs don't accumulate onto the
  // same rows — mirrors how the conformance suite isolates test runs
  // without ever TRUNCATE-ing shared tables.
  const fieldId = `example_${Date.now()}`;

  // 1. First field: write two entries, one with confidence, then close.
  console.log(`\n— field 1 — writing to field_id "${fieldId}" —`);
  const adapter1 = createPostgresAdapter({ connectionString, fieldId });
  await adapter1.init?.();
  const field1 = createField({ adapter: adapter1 });

  await field1.write({
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
  console.log("  wrote 2 entries");

  await adapter1.close?.();
  console.log("  closed field 1's connection");

  // 2. Second field: fresh Field instance, fresh connection pool, same
  //    field_id. Nothing here is shared with field1 except the database row.
  console.log("\n— field 2 — a new connection, the same field_id —");
  const adapter2 = createPostgresAdapter({ connectionString, fieldId });
  const field2 = createField({ adapter: adapter2 });

  const all = await field2.read();
  console.log(`  read() sees ${all.length} entries written by field 1:`);
  for (const entry of all) {
    console.log(
      `    [${entry.agent}] ${entry.intent} (confidence: ${entry.confidence?.score ?? "none"})`,
    );
  }

  // 3. replay() walks the same durable log, from the second field.
  console.log("\n— field 2 — replay() —");
  const events = await field2.replay();
  for (const event of events) {
    if (event.type === "RECORD") {
      console.log(`  [RECORD v${event.v}] seq=${event.seq} lamport=${event.lamport}`);
    }
  }

  await adapter2.close?.();
  console.log("\nPersistence confirmed: field 2 never shared memory with field 1,");
  console.log(`only the database. Rows remain under field_id "${fieldId}" for inspection.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
