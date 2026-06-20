import { describe, expect, it } from "vitest";
import { AkashikError, createField } from "../src/index.js";

void AkashikError;

const INTENT = "valid intent that meets the minimum length requirement";

// ── happy path ────────────────────────────────────────────────────────────────

describe("field.reckon() — happy path", () => {
  it("returns ReckonResult with entries and conflicts arrays", async () => {
    const field = createField();
    await field.write({
      entry: { topic: "pricing", price: "$29" },
      intent: "initial pricing observation from the researcher",
      agent: "researcher",
    });
    const result = await field.reckon({ agent: "writer", topic: "pricing" });
    expect(Array.isArray(result.entries)).toBe(true);
    expect(Array.isArray(result.conflicts)).toBe(true);
  });

  it("returns empty conflicts when only one entry is visible", async () => {
    const field = createField();
    await field.write({
      entry: { topic: "pricing", price: "$29" },
      intent: "single pricing observation",
      agent: "researcher",
    });
    const result = await field.reckon({ agent: "writer", topic: "pricing" });
    expect(result.entries).toHaveLength(1);
    expect(result.conflicts).toHaveLength(0);
  });

  it("entries match what attune would return (same ids, same count)", async () => {
    const field = createField();
    await field.write({
      entry: { topic: "pricing", price: "$29" },
      intent: "pricing observation from researcher agent",
      agent: "researcher",
    });
    await field.write({
      entry: { topic: "pricing", price: "$39" },
      intent: "pricing observation from fact-checker agent",
      agent: "fact-checker",
    });

    const attuneResult = await field.attune({ agent: "writer", topic: "pricing" });
    const reckonResult = await field.reckon({ agent: "writer", topic: "pricing" });

    expect(reckonResult.entries).toHaveLength(attuneResult.length);
    expect(reckonResult.entries.map((e) => e.id).sort()).toEqual(
      attuneResult.map((e) => e.id).sort(),
    );
  });

  it("entries carry relevance_score and relevance_reason", async () => {
    const field = createField();
    await field.write({
      entry: { topic: "pricing", price: "$29" },
      intent: "pricing observation for market analysis",
      agent: "researcher",
    });
    const result = await field.reckon({ agent: "writer", topic: "pricing" });
    expect(typeof result.entries[0]?.relevance_score).toBe("number");
    expect(result.entries[0]?.relevance_reason).toBeDefined();
  });
});

// ── conflict detection ────────────────────────────────────────────────────────

describe("field.reckon() — conflict detection", () => {
  it("detects a conflict between two entries with disagreeing primitive shared keys", async () => {
    const field = createField();
    await field.write({
      entry: { topic: "pricing", price: "$29" },
      intent: "pricing observation from researcher agent",
      agent: "researcher",
    });
    await field.write({
      entry: { topic: "pricing", price: "$39" },
      intent: "pricing observation from fact-checker agent",
      agent: "fact-checker",
    });
    const result = await field.reckon({ agent: "writer", topic: "pricing" });
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.keys).toEqual(["price"]);
  });

  it("conflict carries references to both entries", async () => {
    const field = createField();
    const { id: idA } = await field.write({
      entry: { topic: "pricing", price: "$29" },
      intent: "pricing observation from researcher agent",
      agent: "researcher",
    });
    const { id: idB } = await field.write({
      entry: { topic: "pricing", price: "$39" },
      intent: "pricing observation from fact-checker agent",
      agent: "fact-checker",
    });
    const result = await field.reckon({ agent: "writer", topic: "pricing" });
    const ids = [result.conflicts[0]?.a.id, result.conflicts[0]?.b.id].sort();
    expect(ids).toEqual([idA, idB].sort());
  });

  it("detects conflicts on multiple shared keys", async () => {
    const field = createField();
    await field.write({
      entry: { topic: "pricing", price: "$29", source: "g2" },
      intent: "pricing observation from researcher agent",
      agent: "researcher",
    });
    await field.write({
      entry: { topic: "pricing", price: "$39", source: "stripe" },
      intent: "pricing observation from fact-checker agent",
      agent: "fact-checker",
    });
    const result = await field.reckon({ agent: "writer", topic: "pricing" });
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.keys).toEqual(["price", "source"]);
  });

  it("conflicting keys list is alphabetically sorted", async () => {
    const field = createField();
    await field.write({
      entry: { topic: "pricing", zzz: "a", aaa: "1", mmm: "x" },
      intent: "pricing entry with multiple keys from researcher",
      agent: "researcher",
    });
    await field.write({
      entry: { topic: "pricing", zzz: "b", aaa: "2", mmm: "y" },
      intent: "pricing entry with different values from fact-checker",
      agent: "fact-checker",
    });
    const result = await field.reckon({ agent: "writer", topic: "pricing" });
    expect(result.conflicts[0]?.keys).toEqual(["aaa", "mmm", "zzz"]);
  });

  it("does not conflict when shared key has the same value", async () => {
    const field = createField();
    await field.write({
      entry: { topic: "pricing", price: "$29" },
      intent: "pricing observation from researcher agent",
      agent: "researcher",
    });
    await field.write({
      entry: { topic: "pricing", price: "$29" },
      intent: "fact-checker confirms the same price value",
      agent: "fact-checker",
    });
    const result = await field.reckon({ agent: "writer", topic: "pricing" });
    expect(result.conflicts).toHaveLength(0);
  });

  it("does not conflict when entries share only the topic field", async () => {
    const field = createField();
    await field.write({
      entry: { topic: "pricing", price: "$29" },
      intent: "researcher reports price for market analysis",
      agent: "researcher",
    });
    await field.write({
      entry: { topic: "pricing", region: "uk" },
      intent: "fact-checker reports region for market analysis",
      agent: "fact-checker",
    });
    const result = await field.reckon({ agent: "writer", topic: "pricing" });
    expect(result.conflicts).toHaveLength(0);
  });

  it("does not conflict on object-valued shared keys (deferred to v0.4)", async () => {
    const field = createField();
    await field.write({
      entry: { topic: "pricing", meta: { source: "g2" } },
      intent: "first pricing with metadata from researcher",
      agent: "researcher",
    });
    await field.write({
      entry: { topic: "pricing", meta: { source: "stripe" } },
      intent: "second pricing with different metadata from fact-checker",
      agent: "fact-checker",
    });
    const result = await field.reckon({ agent: "writer", topic: "pricing" });
    expect(result.conflicts).toHaveLength(0);
  });

  it("detects conflict when both values are numeric and differ", async () => {
    const field = createField();
    await field.write({
      entry: { topic: "stats", count: 42 },
      intent: "researcher count observation for analysis",
      agent: "researcher",
    });
    await field.write({
      entry: { topic: "stats", count: 43 },
      intent: "fact-checker count observation for analysis",
      agent: "fact-checker",
    });
    const result = await field.reckon({ agent: "writer", topic: "stats" });
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.keys).toEqual(["count"]);
  });

  it("does not conflict when one value is primitive and the other is an object", async () => {
    const field = createField();
    await field.write({
      entry: { topic: "stats", count: 42 },
      intent: "researcher reports numeric count value",
      agent: "researcher",
    });
    await field.write({
      entry: { topic: "stats", count: { value: 42 } },
      intent: "fact-checker reports count as an object",
      agent: "fact-checker",
    });
    const result = await field.reckon({ agent: "writer", topic: "stats" });
    expect(result.conflicts).toHaveLength(0);
  });

  it("each conflict pair appears once, not twice", async () => {
    const field = createField();
    await field.write({
      entry: { topic: "pricing", price: "$29" },
      intent: "pricing observation from researcher agent",
      agent: "researcher",
    });
    await field.write({
      entry: { topic: "pricing", price: "$39" },
      intent: "pricing observation from fact-checker agent",
      agent: "fact-checker",
    });
    const result = await field.reckon({ agent: "writer", topic: "pricing" });
    expect(result.conflicts).toHaveLength(1);
  });

  it("three-way conflicts produce three pairs", async () => {
    const field = createField();
    await field.write({ entry: { topic: "pricing", price: "$29" }, intent: INTENT, agent: "a1" });
    await field.write({ entry: { topic: "pricing", price: "$39" }, intent: INTENT, agent: "a2" });
    await field.write({ entry: { topic: "pricing", price: "$49" }, intent: INTENT, agent: "a3" });
    const result = await field.reckon({ agent: "writer", topic: "pricing" });
    expect(result.conflicts).toHaveLength(3);
  });

  it("no conflicts when field is empty", async () => {
    const field = createField();
    const result = await field.reckon({ agent: "caller" });
    expect(result.entries).toHaveLength(0);
    expect(result.conflicts).toEqual([]);
  });
});

// ── visibility rules ─────────────────────────────────────────────────────────

describe("field.reckon() — visibility rules", () => {
  it("self-authored entries are excluded — conflicts only between visible entries", async () => {
    const field = createField();
    await field.write({
      entry: { topic: "pricing", price: "$29" },
      intent: "researcher's own pricing observation",
      agent: "researcher",
    });
    await field.write({
      entry: { topic: "pricing", price: "$39" },
      intent: "fact-checker's pricing observation",
      agent: "fact-checker",
    });
    // Researcher reckons: own write is invisible, so only fact-checker's entry is visible.
    const result = await field.reckon({ agent: "researcher", topic: "pricing" });
    expect(result.entries).toHaveLength(1);
    expect(result.conflicts).toHaveLength(0);
  });

  it("retracted entries are excluded from entries and do not contribute to conflicts", async () => {
    const field = createField();
    const { id: firstId } = await field.write({
      entry: { topic: "pricing", price: "$29" },
      intent: "initial pricing observation for market analysis",
      agent: "researcher",
    });
    await field.write({
      entry: { topic: "pricing", price: "$39" },
      intent: "second pricing observation for market analysis",
      agent: "fact-checker",
    });
    await field.retract({
      id: firstId,
      intent: "withdrawing the first observation as stale",
      agent: "researcher",
    });
    const result = await field.reckon({ agent: "writer", topic: "pricing" });
    expect(result.entries).toHaveLength(1);
    expect(result.conflicts).toHaveLength(0);
  });

  it("superseded entries are excluded and do not contribute to conflicts", async () => {
    const field = createField();
    const { id: firstId } = await field.write({
      entry: { topic: "pricing", price: "$29" },
      intent: "initial pricing observation for market analysis",
      agent: "researcher",
    });
    await field.write({
      entry: { topic: "pricing", price: "$39" },
      intent: "second pricing observation for market analysis",
      agent: "fact-checker",
    });
    await field.supersede({
      superseding_id: firstId,
      entry: { topic: "pricing", price: "$49" },
      intent: "strategist updates pricing with newer benchmark data",
      agent: "strategist",
    });
    // researcher's $29 is superseded; visible: fact-checker's $39 + strategist's $49.
    const result = await field.reckon({ agent: "writer", topic: "pricing" });
    expect(result.entries).toHaveLength(2);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.keys).toEqual(["price"]);
  });

  it("caller's own drafts are visible and can conflict with others' committed entries", async () => {
    const field = createField();
    await field.write({
      entry: { topic: "pricing", price: "$29" },
      intent: "fact-checker's committed pricing observation",
      agent: "fact-checker",
    });
    await field.draft({
      entry: { topic: "pricing", price: "$39" },
      intent: "researcher's draft pricing pending verification",
      agent: "researcher",
    });
    const result = await field.reckon({ agent: "researcher", topic: "pricing" });
    expect(result.entries).toHaveLength(2);
    expect(result.conflicts).toHaveLength(1);
  });
});

// ── validation ────────────────────────────────────────────────────────────────

describe("field.reckon() — validation", () => {
  it("rejects missing agent", async () => {
    const field = createField();
    await expect(
      // @ts-expect-error — missing agent
      field.reckon({}),
    ).rejects.toMatchObject({ code: "AGENT_REQUIRED" });
  });

  it("rejects empty agent string", async () => {
    const field = createField();
    await expect(field.reckon({ agent: "" })).rejects.toMatchObject({ code: "AGENT_REQUIRED" });
  });

  it("rejects negative max_units", async () => {
    const field = createField();
    await expect(field.reckon({ agent: "caller", max_units: -1 })).rejects.toMatchObject({
      code: "INVALID_QUERY",
    });
  });
});

// ── max_units interaction ─────────────────────────────────────────────────────

describe("field.reckon() — max_units interaction", () => {
  it("conflicts only surface between entries surviving max_units truncation", async () => {
    const field = createField();
    await field.write({ entry: { topic: "pricing", price: "$29" }, intent: INTENT, agent: "a1" });
    await field.write({ entry: { topic: "pricing", price: "$39" }, intent: INTENT, agent: "a2" });
    await field.write({ entry: { topic: "pricing", price: "$49" }, intent: INTENT, agent: "a3" });

    // All three visible → 3 conflicts.
    const full = await field.reckon({ agent: "writer", topic: "pricing" });
    expect(full.conflicts).toHaveLength(3);

    // max_units=2 → 2 entries (most recent by epoch/score), 1 conflict.
    const capped = await field.reckon({ agent: "writer", topic: "pricing", max_units: 2 });
    expect(capped.entries).toHaveLength(2);
    expect(capped.conflicts).toHaveLength(1);
  });

  it("max_units=0 returns empty entries and no conflicts", async () => {
    const field = createField();
    await field.write({ entry: { topic: "pricing", price: "$29" }, intent: INTENT, agent: "a1" });
    const result = await field.reckon({ agent: "writer", topic: "pricing", max_units: 0 });
    expect(result.entries).toHaveLength(0);
    expect(result.conflicts).toHaveLength(0);
  });
});

// ── conflict ordering ─────────────────────────────────────────────────────────

describe("field.reckon() — conflict ordering", () => {
  it("conflicts ordered by timestamp of second-written entry, ascending", async () => {
    const field = createField();
    await field.write({ entry: { topic: "pricing", price: "$29" }, intent: INTENT, agent: "a1" });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await field.write({ entry: { topic: "pricing", price: "$39" }, intent: INTENT, agent: "a2" });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await field.write({ entry: { topic: "pricing", price: "$49" }, intent: INTENT, agent: "a3" });

    const result = await field.reckon({ agent: "writer", topic: "pricing" });
    expect(result.conflicts).toHaveLength(3);

    // Verify each successive conflict pair has a non-decreasing max timestamp.
    const maxTs = result.conflicts.map((c) => Math.max(c.a.timestamp, c.b.timestamp));
    for (let i = 1; i < maxTs.length; i++) {
      expect(maxTs[i]).toBeGreaterThanOrEqual(maxTs[i - 1] as number);
    }
  });
});

// ── Story 7 definition-of-done smoke test ─────────────────────────────────────

describe("reckon() — two-prices smoke test (Story 7 DoD)", () => {
  it("two entries with different price → 1 conflict with keys ['price']; retract one → 0 conflicts", async () => {
    const field = createField();

    const { id: id1 } = await field.write({
      entry: { topic: "pricing", price: "$29" },
      intent: "first pricing observation from researcher",
      agent: "researcher",
    });
    await field.write({
      entry: { topic: "pricing", price: "$39" },
      intent: "second pricing observation from fact-checker",
      agent: "fact-checker",
    });

    const r1 = await field.reckon({ agent: "writer", topic: "pricing" });
    expect(r1.conflicts).toHaveLength(1);
    expect(r1.conflicts[0]?.keys).toEqual(["price"]);

    await field.retract({
      id: id1,
      intent: "withdrawing first observation as stale data",
      agent: "researcher",
    });

    const r2 = await field.reckon({ agent: "writer", topic: "pricing" });
    expect(r2.conflicts).toHaveLength(0);
  });
});
