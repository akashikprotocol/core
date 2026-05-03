import { describe, expect, it } from "vitest";
import { createField } from "../src/index.js";

describe("README Quick Start", () => {
  it("the documented example runs and produces expected output", async () => {
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

    // The README says: "Both entries, surfaced with their intents, so the writer
    // can reason about *why* the field looks the way it does."
    expect(relevant).toHaveLength(2);
    expect(relevant.map((e) => e.intent)).toEqual([
      "gathering market signal for pricing recommendation",
      "flagging data quality before the writer uses it",
    ]);
    expect(relevant.map((e) => e.agent)).toEqual(["researcher", "fact-checker"]);
  });
});
