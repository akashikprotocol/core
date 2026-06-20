import { describe, expect, it } from "vitest";
import { AkashikError, createField } from "../src/index.js";

// keep the import alive — tests reference AkashikError via toMatchObject
void AkashikError;

const INTENT = "valid intent that meets the minimum length requirement";

// ── retract() — happy path ───────────────────────────────────────────────────

describe("field.retract() — happy path", () => {
  it("retracts a committed entry written by the same agent", async () => {
    const field = createField();
    const { id } = await field.write({
      entry: { topic: "pricing", price: "$29" },
      intent: "initial pricing observation for market analysis",
      agent: "researcher",
    });
    await expect(
      field.retract({
        id,
        intent: "data was outdated — withdrawing the claim",
        agent: "researcher",
      }),
    ).resolves.toBeUndefined();
  });

  it("retracted entry is not visible in attune", async () => {
    const field = createField();
    const { id } = await field.write({
      entry: { topic: "pricing" },
      intent: "initial pricing observation for market analysis",
      agent: "researcher",
    });
    await field.retract({
      id,
      intent: "data was outdated — withdrawing the claim",
      agent: "researcher",
    });
    const result = await field.attune({ agent: "writer", topic: "pricing" });
    expect(result).toHaveLength(0);
  });

  it("retracted entry status is 'retracted' in read()", async () => {
    const field = createField();
    const { id } = await field.write({
      entry: { topic: "pricing" },
      intent: "initial pricing observation for market analysis",
      agent: "researcher",
    });
    await field.retract({
      id,
      intent: "data was outdated — withdrawing the claim",
      agent: "researcher",
    });
    const all = await field.read();
    expect(all.find((e) => e.id === id)?.status).toBe("retracted");
  });

  it("retraction is idempotent — retracting twice succeeds silently", async () => {
    const field = createField();
    const { id } = await field.write({
      entry: { topic: "pricing" },
      intent: "initial pricing observation for market analysis",
      agent: "researcher",
    });
    await field.retract({ id, intent: "first retraction of the entry", agent: "researcher" });
    await expect(
      field.retract({ id, intent: "second retraction should not fail", agent: "researcher" }),
    ).resolves.toBeUndefined();
  });

  it("retracting a superseded entry is a silent no-op", async () => {
    const field = createField();
    const { id: originalId } = await field.write({
      entry: { topic: "pricing" },
      intent: "initial pricing observation for market analysis",
      agent: "researcher",
    });
    await field.supersede({
      superseding_id: originalId,
      entry: { topic: "pricing", price: "$39" },
      intent: "revised pricing after fresh verification data",
      agent: "fact-checker",
    });
    // Original is now superseded; retracting it should be a no-op
    await expect(
      field.retract({
        id: originalId,
        intent: "trying to retract superseded entry",
        agent: "researcher",
      }),
    ).resolves.toBeUndefined();
  });
});

// ── retract() — authorisation ────────────────────────────────────────────────

describe("field.retract() — authorisation", () => {
  it("rejects retraction by a non-author", async () => {
    const field = createField();
    const { id } = await field.write({
      entry: { topic: "pricing" },
      intent: "initial pricing observation for market analysis",
      agent: "researcher",
    });
    await expect(
      field.retract({
        id,
        intent: "fact-checker tries to retract researcher entry",
        agent: "fact-checker",
      }),
    ).rejects.toMatchObject({ code: "RETRACT_NOT_AUTHORIZED" });
  });

  it("rejects retraction of an entry without an agent by any caller", async () => {
    const field = createField();
    const { id } = await field.write({
      entry: { topic: "anon" },
      intent: "anonymous write without an agent field set",
    });
    await expect(
      field.retract({ id, intent: "trying to retract an unauthored entry", agent: "any-agent" }),
    ).rejects.toMatchObject({ code: "RETRACT_NOT_AUTHORIZED" });
  });
});

// ── retract() — validation ───────────────────────────────────────────────────

describe("field.retract() — validation", () => {
  it("rejects unknown entry id", async () => {
    const field = createField();
    await expect(
      field.retract({ id: "01HK000000000000000000000A", intent: INTENT, agent: "researcher" }),
    ).rejects.toMatchObject({ code: "ENTRY_NOT_FOUND" });
  });

  it("rejects empty id", async () => {
    const field = createField();
    await expect(
      field.retract({ id: "", intent: INTENT, agent: "researcher" }),
    ).rejects.toMatchObject({ code: "ENTRY_NOT_FOUND" });
  });

  it("rejects empty agent", async () => {
    const field = createField();
    const { id } = await field.write({
      entry: { topic: "x" },
      intent: "valid initial intent for the entry",
      agent: "researcher",
    });
    await expect(field.retract({ id, intent: INTENT, agent: "" })).rejects.toMatchObject({
      code: "AGENT_REQUIRED",
    });
  });

  it("rejects intent below minIntentLength", async () => {
    const field = createField();
    const { id } = await field.write({
      entry: { topic: "x" },
      intent: "valid initial intent for the entry",
      agent: "researcher",
    });
    await expect(field.retract({ id, intent: "short", agent: "researcher" })).rejects.toMatchObject(
      { code: "INTENT_TOO_SHORT" },
    );
  });
});

// ── supersede() — happy path ─────────────────────────────────────────────────

describe("field.supersede() — happy path", () => {
  it("supersedes an entry and returns a SupersedeResult", async () => {
    const field = createField();
    const { id: originalId } = await field.write({
      entry: { topic: "pricing", price: "$29" },
      intent: "initial pricing observation for market analysis",
      agent: "researcher",
    });
    const result = await field.supersede({
      superseding_id: originalId,
      entry: { topic: "pricing", price: "$39" },
      intent: "revised pricing after independent verification",
      agent: "researcher",
    });
    expect(result.id).not.toBe(originalId);
    expect(typeof result.epoch).toBe("number");
    expect(typeof result.timestamp).toBe("number");
  });

  it("any agent can supersede (not restricted to original author)", async () => {
    const field = createField();
    const { id: originalId } = await field.write({
      entry: { topic: "pricing", price: "$29" },
      intent: "initial pricing observation for market analysis",
      agent: "researcher",
    });
    await expect(
      field.supersede({
        superseding_id: originalId,
        entry: { topic: "pricing", price: "$39" },
        intent: "fact-checker provides updated pricing data",
        agent: "fact-checker",
      }),
    ).resolves.toMatchObject({ id: expect.any(String) });
  });

  it("predecessor is marked superseded", async () => {
    const field = createField();
    const { id: originalId } = await field.write({
      entry: { topic: "pricing", price: "$29" },
      intent: "initial pricing observation for market analysis",
      agent: "researcher",
    });
    await field.supersede({
      superseding_id: originalId,
      entry: { topic: "pricing", price: "$39" },
      intent: "revised pricing after independent verification",
      agent: "fact-checker",
    });
    const all = await field.read();
    expect(all.find((e) => e.id === originalId)?.status).toBe("superseded");
  });

  it("predecessor is invisible in attune after supersession", async () => {
    const field = createField();
    const { id: originalId } = await field.write({
      entry: { topic: "pricing", price: "$29" },
      intent: "initial pricing observation for market analysis",
      agent: "researcher",
    });
    await field.supersede({
      superseding_id: originalId,
      entry: { topic: "pricing", price: "$39" },
      intent: "fact-checker provides updated pricing data",
      agent: "fact-checker",
    });
    const result = await field.attune({ agent: "writer", topic: "pricing" });
    expect(result).toHaveLength(1);
    expect(result[0]?.entry.price).toBe("$39");
  });

  it("new entry has status committed", async () => {
    const field = createField();
    const { id: originalId } = await field.write({
      entry: { topic: "pricing" },
      intent: "initial pricing observation for market analysis",
      agent: "researcher",
    });
    const { id: newId } = await field.supersede({
      superseding_id: originalId,
      entry: { topic: "pricing", price: "$39" },
      intent: "revised pricing after independent verification",
      agent: "fact-checker",
    });
    const all = await field.read();
    expect(all.find((e) => e.id === newId)?.status).toBe("committed");
  });

  it("new entry preserves the superseding agent", async () => {
    const field = createField();
    const { id: originalId } = await field.write({
      entry: { topic: "pricing" },
      intent: "initial pricing observation for market analysis",
      agent: "researcher",
    });
    const { id: newId } = await field.supersede({
      superseding_id: originalId,
      entry: { topic: "pricing" },
      intent: "revised pricing after independent verification",
      agent: "fact-checker",
    });
    const all = await field.read();
    expect(all.find((e) => e.id === newId)?.agent).toBe("fact-checker");
  });
});

// ── supersede() — chains ─────────────────────────────────────────────────────

describe("field.supersede() — chains", () => {
  it("superseding the original id twice extends the chain — only latest visible", async () => {
    const field = createField();
    const { id: originalId } = await field.write({
      entry: { topic: "pricing", price: "$29" },
      intent: "initial pricing observation for market analysis",
      agent: "researcher",
    });
    const { id: firstId } = await field.supersede({
      superseding_id: originalId,
      entry: { topic: "pricing", price: "$39" },
      intent: "first revision after independent verification",
      agent: "fact-checker",
    });
    await field.supersede({
      superseding_id: originalId,
      entry: { topic: "pricing", price: "$49" },
      intent: "second revision after newer market data arrived",
      agent: "strategist",
    });

    // Only the latest should be visible in attune.
    const result = await field.attune({ agent: "writer", topic: "pricing" });
    expect(result).toHaveLength(1);
    expect(result[0]?.entry.price).toBe("$49");

    // firstId should be superseded
    const all = await field.read({ topic: "pricing" });
    expect(all.find((e) => e.id === firstId)?.status).toBe("superseded");
  });

  it("each link in a 3-entry chain is correctly marked superseded except the latest", async () => {
    const field = createField();
    const { id: originalId } = await field.write({
      entry: { topic: "pricing" },
      intent: "initial pricing observation for market analysis",
      agent: "researcher",
    });
    const { id: midId } = await field.supersede({
      superseding_id: originalId,
      entry: { topic: "pricing", v: 2 },
      intent: "first revision after independent verification",
      agent: "fact-checker",
    });
    await field.supersede({
      superseding_id: originalId,
      entry: { topic: "pricing", v: 3 },
      intent: "second revision after fresh research data",
      agent: "strategist",
    });

    const all = await field.read({ topic: "pricing" });
    expect(all.find((e) => e.id === originalId)?.status).toBe("superseded");
    expect(all.find((e) => e.id === midId)?.status).toBe("superseded");
    const committed = all.filter((e) => e.status === "committed");
    expect(committed).toHaveLength(1);
    expect((committed[0]?.entry as Record<string, unknown>).v).toBe(3);
  });

  it("superseding directly via the mid-id also extends the chain", async () => {
    const field = createField();
    const { id: originalId } = await field.write({
      entry: { topic: "pricing" },
      intent: "initial pricing observation for market analysis",
      agent: "researcher",
    });
    const { id: midId } = await field.supersede({
      superseding_id: originalId,
      entry: { topic: "pricing", v: 2 },
      intent: "first revision after independent verification",
      agent: "fact-checker",
    });
    await field.supersede({
      superseding_id: midId,
      entry: { topic: "pricing", v: 3 },
      intent: "third revision extending the chain directly",
      agent: "strategist",
    });

    const result = await field.attune({ agent: "writer", topic: "pricing" });
    expect(result).toHaveLength(1);
    expect((result[0]?.entry as Record<string, unknown>).v).toBe(3);
  });
});

// ── supersede() — validation ─────────────────────────────────────────────────

describe("field.supersede() — validation", () => {
  it("rejects unknown superseding_id", async () => {
    const field = createField();
    await expect(
      field.supersede({
        superseding_id: "01HK000000000000000000000A",
        entry: { topic: "x" },
        intent: INTENT,
        agent: "agent",
      }),
    ).rejects.toMatchObject({ code: "ENTRY_NOT_FOUND" });
  });

  it("rejects superseding a retracted entry", async () => {
    const field = createField();
    const { id } = await field.write({
      entry: { topic: "x" },
      intent: "valid initial intent for the entry",
      agent: "researcher",
    });
    await field.retract({
      id,
      intent: "withdrawing the claim as data was wrong",
      agent: "researcher",
    });
    await expect(
      field.supersede({
        superseding_id: id,
        entry: { topic: "x", v: 2 },
        intent: "trying to supersede a retracted entry here",
        agent: "fact-checker",
      }),
    ).rejects.toMatchObject({ code: "ENTRY_NOT_FOUND" });
  });

  it("rejects empty agent", async () => {
    const field = createField();
    const { id } = await field.write({
      entry: { topic: "x" },
      intent: "valid initial intent for the entry",
      agent: "researcher",
    });
    await expect(
      field.supersede({ superseding_id: id, entry: { topic: "x" }, intent: INTENT, agent: "" }),
    ).rejects.toMatchObject({ code: "AGENT_REQUIRED" });
  });

  it("rejects intent below minIntentLength", async () => {
    const field = createField();
    const { id } = await field.write({
      entry: { topic: "x" },
      intent: "valid initial intent for the entry",
      agent: "researcher",
    });
    await expect(
      field.supersede({
        superseding_id: id,
        entry: { topic: "x", v: 2 },
        intent: "short",
        agent: "agent",
      }),
    ).rejects.toMatchObject({ code: "INTENT_TOO_SHORT" });
  });

  it("rejects non-object entry", async () => {
    const field = createField();
    const { id } = await field.write({
      entry: { topic: "x" },
      intent: "valid initial intent for the entry",
      agent: "researcher",
    });
    await expect(
      field.supersede({
        superseding_id: id,
        entry: "string" as unknown as Record<string, unknown>,
        intent: INTENT,
        agent: "agent",
      }),
    ).rejects.toMatchObject({ code: "INVALID_ENTRY" });
  });
});

// ── status filtering — interactions ──────────────────────────────────────────

describe("status filtering — interactions with other operations", () => {
  it("retracted entries do not block re-writing the same topic", async () => {
    const field = createField();
    const { id } = await field.write({
      entry: { topic: "pricing" },
      intent: "first pricing observation for the market",
      agent: "researcher",
    });
    await field.retract({
      id,
      intent: "withdrawing first observation as it was inaccurate",
      agent: "researcher",
    });
    await field.write({
      entry: { topic: "pricing" },
      intent: "fresh pricing observation after previous retraction",
      agent: "researcher",
    });
    const result = await field.attune({ agent: "writer", topic: "pricing" });
    expect(result).toHaveLength(1);
  });

  it("supersession chains don't interfere with unrelated topics", async () => {
    const field = createField();
    await field.write({
      entry: { topic: "pricing" },
      intent: "pricing entry for the market analysis",
      agent: "researcher",
    });
    const { id } = await field.write({
      entry: { topic: "market-size" },
      intent: "market size entry for the analysis",
      agent: "researcher",
    });
    await field.supersede({
      superseding_id: id,
      entry: { topic: "market-size", v: 2 },
      intent: "updated market size with fresh data",
      agent: "fact-checker",
    });

    const pricing = await field.attune({ agent: "writer", topic: "pricing" });
    const marketSize = await field.attune({ agent: "writer", topic: "market-size" });
    expect(pricing).toHaveLength(1);
    expect(marketSize).toHaveLength(1);
  });

  it("calling agent's own retracted entry is also excluded from attune", async () => {
    const field = createField();
    const { id } = await field.write({
      entry: { topic: "pricing" },
      intent: "pricing observation for the market analysis",
      agent: "researcher",
    });
    await field.retract({
      id,
      intent: "researcher withdraws own claim as incorrect",
      agent: "researcher",
    });
    const result = await field.attune({ agent: "researcher", topic: "pricing" });
    expect(result).toHaveLength(0);
  });

  it("multiple entries: only committed ones visible after mixed operations", async () => {
    const field = createField();
    // entry A — will be retracted
    const { id: idA } = await field.write({
      entry: { topic: "pricing" },
      intent: "entry A initial pricing observation",
      agent: "researcher",
    });
    // entry B — will be superseded
    const { id: idB } = await field.write({
      entry: { topic: "pricing" },
      intent: "entry B pricing observation from another source",
      agent: "researcher",
    });
    // entry C — stays committed
    await field.write({
      entry: { topic: "pricing" },
      intent: "entry C pricing observation that stays committed",
      agent: "researcher",
    });

    await field.retract({
      id: idA,
      intent: "entry A was based on stale data",
      agent: "researcher",
    });
    await field.supersede({
      superseding_id: idB,
      entry: { topic: "pricing", v: 2 },
      intent: "entry B superseded with fresh verified data",
      agent: "fact-checker",
    });

    // writer attunes: sees entry C (committed by researcher) + new superseder (committed by fact-checker)
    const result = await field.attune({ agent: "writer", topic: "pricing" });
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.status === "committed")).toBe(true);
  });
});

// ── backward compatibility ────────────────────────────────────────────────────

describe("backward compatibility", () => {
  it("v0.1 write/read/attune still work without retract/supersede", async () => {
    const field = createField();
    await field.write({
      entry: { topic: "x" },
      intent: "standard committed write in the field",
      agent: "writer",
    });
    const all = await field.read();
    expect(all).toHaveLength(1);
    expect(all[0]?.status).toBe("committed");

    const relevant = await field.attune({ agent: "caller", topic: "x" });
    expect(relevant).toHaveLength(1);
  });

  it("Story 5 draft/commit cycle still works after Story 6 additions", async () => {
    const field = createField();
    const { draft_id } = await field.draft({
      entry: { topic: "plans" },
      intent: "drafting a plan before committing it",
      agent: "alice",
    });
    const { id } = await field.commit({ draft_id });
    const all = await field.read();
    expect(all.find((e) => e.id === id)?.status).toBe("committed");
  });
});

// ── alice/bob/carol integration smoke test ────────────────────────────────────

describe("alice/bob/carol — full retract + supersession chain smoke test", () => {
  it("covers the complete Story 6 definition-of-done scenario end to end", async () => {
    const field = createField();

    // 1. Alice writes an entry.
    const { id } = await field.write({
      entry: { topic: "pricing", price: "$29" },
      intent: "alice initial pricing observation",
      agent: "alice",
    });

    // 2. Bob tries to retract alice's entry → RETRACT_NOT_AUTHORIZED.
    await expect(
      field.retract({ id, intent: "bob tries to retract alice entry", agent: "bob" }),
    ).rejects.toMatchObject({ code: "RETRACT_NOT_AUTHORIZED" });

    // 3. Alice retracts her own entry → success.
    await expect(
      field.retract({ id, intent: "alice withdraws her own pricing entry", agent: "alice" }),
    ).resolves.toBeUndefined();

    // 4. Attune → retracted entry not visible.
    const afterRetract = await field.attune({ agent: "viewer", topic: "pricing" });
    expect(afterRetract).toHaveLength(0);

    // 5. Alice writes a new entry (different id).
    const { id: id2 } = await field.write({
      entry: { topic: "pricing", price: "$39" },
      intent: "alice fresh pricing observation after retraction",
      agent: "alice",
    });
    expect(id2).not.toBe(id);

    // 6. Bob supersedes alice's new entry → success, new id returned.
    const { id: bobId } = await field.supersede({
      superseding_id: id2,
      entry: { topic: "pricing", price: "$49" },
      intent: "bob supersedes alice with corrected pricing data",
      agent: "bob",
    });
    expect(bobId).not.toBe(id2);

    // 7. Carol supersedes the original id2 → chain resolves to bob's entry,
    //    carol's entry becomes the new latest.
    const { id: carolId } = await field.supersede({
      superseding_id: id2,
      entry: { topic: "pricing", price: "$59" },
      intent: "carol extends chain targeting original id2",
      agent: "carol",
    });
    expect(carolId).not.toBe(bobId);

    // bob's intermediate entry should now be superseded.
    const all = await field.read({ topic: "pricing" });
    expect(all.find((e) => e.id === bobId)?.status).toBe("superseded");

    // 8. Attune → exactly 1 result, carol's entry.
    const final = await field.attune({ agent: "viewer", topic: "pricing" });
    expect(final).toHaveLength(1);
    expect(final[0]?.entry.price).toBe("$59");
    expect(final[0]?.agent).toBe("carol");
    expect(final[0]?.id).toBe(carolId);
  });
});
