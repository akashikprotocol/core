import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createFileAdapter } from "../src/file.js";
import { createField } from "../src/index.js";

describe("README Quick Start — in-memory path", () => {
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

describe("README Quick Start — file-backed path", () => {
  it("persistence is a one-line change: everything else stays identical", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "akashik-readme-"));
    const logPath = path.join(dir, "field.jsonl");

    // README says: construct createFileAdapter, init it, pass it to createField.
    const adapter = createFileAdapter({ path: logPath });
    await adapter.init?.();
    const field = createField({ adapter });

    // The rest is the exact same Quick Start body, unmodified.
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

    expect(result.entries).toHaveLength(2);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.keys).toEqual(["price"]);

    await adapter.close?.();

    // README says: close the process, start a new one, construct the field
    // again over the same path, and it resumes exactly where it left off.
    const resumedAdapter = createFileAdapter({ path: logPath });
    const resumedField = createField({ adapter: resumedAdapter });
    const all = await resumedField.read();
    expect(all).toHaveLength(2);

    await resumedAdapter.close?.();
    await fs.rm(dir, { recursive: true, force: true });
  });
});
