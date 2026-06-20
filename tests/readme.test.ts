import { describe, expect, it } from "vitest";
import { createField } from "../src/index.js";

describe("README Quick Start — v0.2", () => {
  it("the documented example runs and produces the conflict the README shows", async () => {
    const field = createField();

    await field.register({ id: "researcher", role: "researcher" });
    await field.register({ id: "fact-checker", role: "researcher" });

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

    const result = await field.reckon({
      agent: "writer",
      topic: "competitor-pricing",
    });

    // README says: result.entries.length === 2
    expect(result.entries).toHaveLength(2);

    // README says: result.conflicts is a 1-element array with keys: ["price"]
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.keys).toEqual(["price"]);
  });
});
