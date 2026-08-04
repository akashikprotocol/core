import { describe } from "vitest";
import { createPostgresAdapter } from "../../src/postgres.js";
import { runAdapterConformanceSuite } from "./adapter-suite.js";

const connectionString = process.env.AKASHIK_TEST_POSTGRES;

if (connectionString === undefined) {
  describe.skip("adapter conformance: PostgresAdapter (set AKASHIK_TEST_POSTGRES to run)", () => {
    // Intentionally empty — contributors without Postgres run everything
    // else. CI sets AKASHIK_TEST_POSTGRES and runs the full matrix.
  });
} else {
  runAdapterConformanceSuite("PostgresAdapter", async () => {
    const fieldId = `test_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const adapter = createPostgresAdapter({ connectionString, fieldId });
    await adapter.init?.();
    return {
      adapter,
      cleanup: async () => {
        // Delete only this test run's rows; never TRUNCATE — the database
        // may hold a developer's other data.
        await adapter.close?.();
      },
    };
  });
}
